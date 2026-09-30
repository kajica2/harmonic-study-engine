"""Marketplace backend: sqlite3 storage, CRUD, GitHub repo-tree sync, and
webhook-triggered refresh.

Listings are stored in a sqlite database at MARKETPLACE_DB_PATH (default
./marketplace.db). The schema is created at module import. All env vars
are read at call time (not import time) so tests can monkeypatch them
per-test. The webhook secret and signature are never logged.

The catalog's source of truth is the HSE GitHub repo's marketplace/
folder: each package is a <slug>.mp3 + <slug>.mid pair.
sync_from_github_repo() pulls the repo tree via the GitHub API and
upserts one listing per complete pair. The webhook stays for
auto-refresh on push.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field, field_validator

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    composer TEXT NOT NULL,
    key TEXT,
    tempo INTEGER,
    form TEXT,
    audio_url TEXT NOT NULL,
    cover_url TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    source_commit TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (title, composer)
)
"""

# Hard cap for webhook request bodies (1 MB).
MAX_WEBHOOK_BODY_BYTES = 1_000_000

# Slug rule for marketplace publishes: lowercase letters, digits and
# dashes only (matches the file names the repo tree sync expects).
SLUG_RE = re.compile(r"^[a-z0-9-]+$")

# GitHub API endpoints for the repo-tree sync. The repo, branch, and
# marketplace folder are env-overridable at call time so tests and
# deployments can point elsewhere without code changes.
GITHUB_API_BASE = "https://api.github.com"
GITHUB_RAW_BASE = "https://raw.githubusercontent.com"
GITHUB_TREE_FETCH_TIMEOUT_SECONDS = 15
# Publish uploads (base64 file bodies) can be larger than a tree
# fetch, so the contents-API calls get a longer timeout.
GITHUB_PUBLISH_TIMEOUT_SECONDS = 30


def webhook_secret_configured() -> bool:
    """True when MARKETPLACE_WEBHOOK_SECRET is set and non-blank.

    Read at call time so tests can monkeypatch per-test. The webhook
    route uses this before its Content-Length fast-path so the 503
    (secret not configured) precedence beats any 400 payload-size
    rejection.
    """
    return bool(os.environ.get("MARKETPLACE_WEBHOOK_SECRET", "").strip())

_LISTING_COLUMNS = (
    "id",
    "title",
    "composer",
    "key",
    "tempo",
    "form",
    "audio_url",
    "cover_url",
    "status",
    "source_commit",
    "created_at",
    "updated_at",
)


class DuplicateListingError(Exception):
    """Raised when a (title, composer) pair already exists."""


class WebhookError(Exception):
    """Raised for webhook failures that map to an HTTP status code."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class SyncError(Exception):
    """Raised when the GitHub repo tree cannot be fetched or parsed."""


class PublishError(Exception):
    """Raised for marketplace publish failures that map to an HTTP status.

    status_code is the HTTP status the route should return (422 for
    validation, 500 for ffmpeg failures, 502 for GitHub API failures,
    503 when GITHUB_TOKEN is unset).
    """

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _utc_now_iso() -> str:
    """Current UTC time as an ISO 8601 string (second precision)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class MarketplaceListing(BaseModel):
    """A marketplace listing. id and timestamps are server-set."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str = Field(..., max_length=200)
    composer: str = Field(..., max_length=200)
    key: Optional[str] = Field(default=None, max_length=32)
    tempo: Optional[int] = Field(default=None, ge=20, le=300)
    form: Optional[str] = Field(default=None, max_length=64)
    audio_url: str
    cover_url: Optional[str] = Field(default=None)
    status: str = Field(default="published", pattern="^(draft|published|archived)$")
    source_commit: Optional[str] = Field(default=None, max_length=64)
    created_at: str = Field(default_factory=_utc_now_iso)
    updated_at: str = Field(default_factory=_utc_now_iso)

    @field_validator("title", "composer")
    @classmethod
    def _strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("audio_url", "cover_url")
    @classmethod
    def _validate_http_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("must be an http(s) URL")
        return value


def _db_path() -> str:
    """Resolve the sqlite file path from env at call time."""
    return os.environ.get("MARKETPLACE_DB_PATH", "./marketplace.db")


def _connect() -> sqlite3.Connection:
    """Open a connection and ensure the schema exists."""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute(_SCHEMA_SQL)
    return conn


@contextmanager
def _db_conn() -> Iterator[sqlite3.Connection]:
    """Yield a connection that commits on success, rolls back on error,
    and always closes."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# Create the schema at module import (default DB path). Every connect
# also runs CREATE TABLE IF NOT EXISTS, so tests that point
# MARKETPLACE_DB_PATH at a temp file get the schema on first use.
_connect().close()


def _listing_row(listing: MarketplaceListing) -> Tuple:
    """Return column values in _LISTING_COLUMNS order."""
    return tuple(getattr(listing, col) for col in _LISTING_COLUMNS)


def _row_to_listing(row: sqlite3.Row) -> MarketplaceListing:
    return MarketplaceListing(**dict(row))


def create_listing(listing: MarketplaceListing) -> MarketplaceListing:
    """Insert a new listing.

    Raises DuplicateListingError if (title, composer) already exists.
    """
    sql = "INSERT INTO marketplace_listings ({cols}) VALUES ({marks})".format(
        cols=", ".join(_LISTING_COLUMNS),
        marks=", ".join("?" for _ in _LISTING_COLUMNS),
    )
    with _db_conn() as conn:
        try:
            conn.execute(sql, _listing_row(listing))
        except sqlite3.IntegrityError:
            raise DuplicateListingError(
                "listing already exists for title={!r} composer={!r}".format(
                    listing.title, listing.composer
                )
            )
    return listing


def get_listing(listing_id: str) -> Optional[MarketplaceListing]:
    """Fetch a listing by id, or None if it does not exist."""
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT * FROM marketplace_listings WHERE id = ?", (listing_id,)
        ).fetchone()
    return _row_to_listing(row) if row is not None else None


def update_listing(
    listing_id: str, listing: MarketplaceListing
) -> Optional[MarketplaceListing]:
    """Replace a listing by id.

    Returns the updated listing, or None if the id does not exist.
    Raises DuplicateListingError if the new (title, composer) collides
    with another row.
    """
    with _db_conn() as conn:
        existing = conn.execute(
            "SELECT * FROM marketplace_listings WHERE id = ?", (listing_id,)
        ).fetchone()
        if existing is None:
            return None
        try:
            conn.execute(
                "UPDATE marketplace_listings SET title = ?, composer = ?, key = ?, "
                "tempo = ?, form = ?, audio_url = ?, cover_url = ?, status = ?, "
                "source_commit = ?, updated_at = ? WHERE id = ?",
                (
                    listing.title,
                    listing.composer,
                    listing.key,
                    listing.tempo,
                    listing.form,
                    listing.audio_url,
                    listing.cover_url,
                    listing.status,
                    listing.source_commit,
                    listing.updated_at,
                    listing_id,
                ),
            )
        except sqlite3.IntegrityError:
            raise DuplicateListingError(
                "another listing already uses title={!r} composer={!r}".format(
                    listing.title, listing.composer
                )
            )
    return listing.model_copy(
        update={"id": listing_id, "created_at": existing["created_at"]}
    )


def list_listings(status: Optional[str] = None) -> List[MarketplaceListing]:
    """List listings, newest first. Optionally filter by status."""
    with closing(_connect()) as conn:
        if status is None:
            rows = conn.execute(
                "SELECT * FROM marketplace_listings ORDER BY created_at DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM marketplace_listings WHERE status = ? "
                "ORDER BY created_at DESC",
                (status,),
            ).fetchall()
    return [_row_to_listing(row) for row in rows]


def upsert_listing(listing: MarketplaceListing) -> Tuple[str, MarketplaceListing]:
    """Insert or update on the (title, composer) unique key.

    Uses INSERT ... ON CONFLICT DO UPDATE (SQLite 3.24+, bundled with
    Python 3.9) so concurrent webhook deliveries for the same
    (title, composer) cannot race into an unhandled IntegrityError:
    whichever INSERT loses the race updates the winner's row instead.
    Returns ("created", listing) or ("updated", listing).
    """
    upsert_sql = (
        "INSERT INTO marketplace_listings ({cols}) VALUES ({marks}) "
        "ON CONFLICT(title, composer) DO UPDATE SET "
        "key = excluded.key, tempo = excluded.tempo, form = excluded.form, "
        "audio_url = excluded.audio_url, cover_url = excluded.cover_url, "
        "status = excluded.status, source_commit = excluded.source_commit, "
        "updated_at = excluded.updated_at"
    ).format(
        cols=", ".join(_LISTING_COLUMNS),
        marks=", ".join("?" for _ in _LISTING_COLUMNS),
    )
    with _db_conn() as conn:
        existing = conn.execute(
            "SELECT * FROM marketplace_listings WHERE title = ? AND composer = ?",
            (listing.title, listing.composer),
        ).fetchone()
        if existing is None:
            conn.execute(upsert_sql, _listing_row(listing))
            # A concurrent delivery may have inserted the same pair
            # between our SELECT and INSERT; ON CONFLICT updated that
            # row instead, so re-read to report the real outcome.
            row = conn.execute(
                "SELECT * FROM marketplace_listings WHERE title = ? AND composer = ?",
                (listing.title, listing.composer),
            ).fetchone()
            if row["id"] == listing.id:
                return "created", listing
            return "updated", listing.model_copy(
                update={"id": row["id"], "created_at": row["created_at"]}
            )
        conn.execute(
            "UPDATE marketplace_listings SET key = ?, tempo = ?, form = ?, "
            "audio_url = ?, cover_url = ?, status = ?, source_commit = ?, "
            "updated_at = ? WHERE id = ?",
            (
                listing.key,
                listing.tempo,
                listing.form,
                listing.audio_url,
                listing.cover_url,
                listing.status,
                listing.source_commit,
                listing.updated_at,
                existing["id"],
            ),
        )
        return "updated", listing.model_copy(
            update={"id": existing["id"], "created_at": existing["created_at"]}
        )


def _github_repo() -> str:
    """Resolve the GitHub repo (owner/name) from env at call time."""
    return os.environ.get("MARKETPLACE_GITHUB_REPO", "kajica2/harmonic-study-engine")


def _github_branch() -> str:
    """Resolve the GitHub branch to sync from env at call time."""
    return os.environ.get("MARKETPLACE_GITHUB_BRANCH", "main")


def _marketplace_dir() -> str:
    """Resolve the marketplace folder path inside the repo from env."""
    return os.environ.get("MARKETPLACE_GITHUB_DIR", "marketplace")


def _fetch_github_tree() -> Dict[str, Any]:
    """Fetch the recursive git tree for the configured repo and branch.

    GET /repos/{repo}/git/trees/{branch}?recursive=1 via stdlib urllib.
    An optional GITHUB_TOKEN env var is sent as a Bearer header when
    present (public repos work without it, but the rate limit is lower).
    The token is never logged. Raises SyncError on transport or HTTP
    errors and on malformed JSON.
    """
    repo = _github_repo()
    branch = _github_branch()
    url = "{}/repos/{}/git/trees/{}?recursive=1".format(
        GITHUB_API_BASE, repo, branch
    )
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "harmonic-study-engine-marketplace-sync",
    }
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = "Bearer {}".format(token)
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=GITHUB_TREE_FETCH_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        raise SyncError(
            "GitHub API returned HTTP {} for {}".format(exc.code, url)
        )
    except URLError as exc:
        raise SyncError("GitHub API request failed: {}".format(exc.reason))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SyncError("GitHub API returned malformed JSON")


def _humanize_slug(slug: str) -> str:
    """Turn a file slug into a display title.

    Replaces dashes and underscores with spaces and title-cases the
    result, so "autumn-leaves" becomes "Autumn Leaves".
    """
    return slug.replace("-", " ").replace("_", " ").strip().title()


def sync_from_github_repo() -> Dict[str, Any]:
    """Pull the marketplace catalog from the GitHub repo tree and upsert.

    Fetches the recursive git tree, finds marketplace/<slug>.mp3 and
    marketplace/<slug>.mid entries, groups them by slug, and upserts one
    listing per slug that has BOTH files. Slugs missing either file are
    skipped. The tree sha is stored as source_commit.

    Returns {"created": n, "updated": n, "skipped": n, "errors": [...]}.
    Raises SyncError if the GitHub tree cannot be fetched.
    """
    tree = _fetch_github_tree()
    if tree.get("truncated"):
        raise SyncError("GitHub tree response was truncated")
    tree_sha = tree.get("sha")
    repo = _github_repo()
    branch = _github_branch()
    prefix = _marketplace_dir() + "/"

    mp3_slugs = set()
    mid_slugs = set()
    for entry in tree.get("tree", []):
        path = entry.get("path", "")
        if not path.startswith(prefix):
            continue
        name = path[len(prefix):]
        if "/" in name:
            continue  # nested subdirectories are not catalog entries
        if name.endswith(".mp3"):
            mp3_slugs.add(name[:-len(".mp3")])
        elif name.endswith(".mid"):
            mid_slugs.add(name[:-len(".mid")])

    created = 0
    updated = 0
    skipped = 0
    errors: List[str] = []
    for slug in sorted(mp3_slugs | mid_slugs):
        if slug not in mp3_slugs or slug not in mid_slugs:
            skipped += 1
            continue
        listing = MarketplaceListing(
            title=_humanize_slug(slug),
            composer="harmonic-study-engine",
            audio_url="{}/{}/{}/{}/{}.mp3".format(
                GITHUB_RAW_BASE, repo, branch, _marketplace_dir(), slug
            ),
            cover_url=None,
            status="published",
            source_commit=tree_sha,
        )
        try:
            action, _ = upsert_listing(listing)
        except Exception as exc:  # one bad slug must not kill the sync
            errors.append("{}: {}".format(slug, exc))
            continue
        if action == "created":
            created += 1
        else:
            updated += 1

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }


def _github_token() -> str:
    """Resolve the GitHub token from env at call time (never logged)."""
    return os.environ.get("GITHUB_TOKEN", "").strip()


def _github_request(
    method: str,
    url: str,
    body: Optional[Dict[str, Any]] = None,
    timeout: int = GITHUB_PUBLISH_TIMEOUT_SECONDS,
) -> Tuple[int, Any]:
    """Perform a GitHub API request with the server-side token.

    Returns (status_code, parsed JSON or raw bytes). Raises
    PublishError(503) when GITHUB_TOKEN is unset and PublishError(502)
    on transport failures. The token is never logged.
    """
    token = _github_token()
    if not token:
        raise PublishError(503, "GITHUB_TOKEN not configured")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "harmonic-study-engine-marketplace-publish",
        "Authorization": "Bearer {}".format(token),
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return resp.status, raw
    except HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return exc.code, raw
    except URLError as exc:
        raise PublishError(502, "GitHub API request failed: {}".format(exc.reason))


def _github_contents_url(path: str) -> str:
    """Build the contents-API URL for a repo-relative file path."""
    return "{}/repos/{}/contents/{}".format(GITHUB_API_BASE, _github_repo(), path)


def _github_get_file_sha(path: str) -> Optional[str]:
    """Fetch the current sha of a repo file, or None when it does not exist.

    Used by the update-if-exists path: a PUT without a sha returns 409
    when the file already exists, and the retry needs the current sha.
    """
    url = _github_contents_url(path)
    status, payload = _github_request("GET", url)
    if status == 404:
        return None
    if status != 200:
        raise PublishError(
            502, "GitHub API returned HTTP {} for {}".format(status, url)
        )
    if isinstance(payload, dict):
        sha = payload.get("sha")
        if isinstance(sha, str) and sha:
            return sha
    raise PublishError(
        502, "GitHub API returned an unexpected payload for {}".format(url)
    )


def _github_put_file(
    path: str, content: bytes, message: str, sha: Optional[str] = None
) -> None:
    """Create or update a file in the repo via the contents API.

    A 409 (file already exists) is handled by fetching the current sha
    and retrying with it, so re-publishing a slug updates the files
    instead of failing. Raises PublishError on any other failure.
    """
    url = _github_contents_url(path)
    body = {
        "message": message,
        "content": base64.b64encode(content).decode("ascii"),
    }
    if sha is not None:
        body["sha"] = sha
    status, _ = _github_request("PUT", url, body=body)
    if status in (200, 201):
        return
    if status == 409:
        existing_sha = _github_get_file_sha(path)
        if existing_sha is None:
            raise PublishError(
                502,
                "GitHub API conflict but file sha could not be read for {}".format(
                    path
                ),
            )
        retry_body = dict(body)
        retry_body["sha"] = existing_sha
        status2, _ = _github_request("PUT", url, body=retry_body)
        if status2 in (200, 201):
            return
        raise PublishError(
            502, "GitHub API returned HTTP {} for {}".format(status2, url)
        )
    raise PublishError(502, "GitHub API returned HTTP {} for {}".format(status, url))


def encode_wav_to_mp3(wav_bytes: bytes) -> bytes:
    """Encode a WAV blob to MP3 via ffmpeg (libmp3lame, 192k).

    Same subprocess pattern as /recordings/upload in server/app.py:
    write the input to a temp file, run ffmpeg, read the output.
    Raises PublishError(500) when ffmpeg is missing or fails.
    """
    import shutil
    import subprocess
    import tempfile

    if not shutil.which("ffmpeg"):
        raise PublishError(500, "ffmpeg is not available on the server")
    with tempfile.TemporaryDirectory() as td:
        in_path = os.path.join(td, "in.wav")
        out_path = os.path.join(td, "out.mp3")
        with open(in_path, "wb") as f:
            f.write(wav_bytes)
        cmd = [
            "ffmpeg",
            "-y",
            "-i", in_path,
            "-codec:a", "libmp3lame",
            "-b:a", "192k",
            out_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            stderr = getattr(e, "stderr", b"")
            detail = (
                stderr.decode("utf-8", errors="ignore")[-500:]
                if stderr
                else str(e)
            )
            raise PublishError(500, "ffmpeg failed: {}".format(detail))
        with open(out_path, "rb") as f:
            return f.read()


def find_listing_by_slug(slug: str) -> Optional[MarketplaceListing]:
    """Find the published listing for a slug via its raw audio URL.

    The repo-tree sync builds audio_url as
    .../marketplace/<slug>.mp3, so a suffix match on the slug is the
    stable lookup key (titles are humanized and not unique).
    """
    suffix = "/{}.mp3".format(slug)
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT * FROM marketplace_listings WHERE audio_url LIKE ?",
            ("%" + suffix,),
        ).fetchall()
    if not rows:
        return None
    return _row_to_listing(rows[0])


def publish_listing(
    slug: str,
    wav_bytes: bytes,
    midi_bytes: bytes,
    title: Optional[str] = None,
    composer: Optional[str] = None,
) -> Dict[str, Any]:
    """Publish a rendered path to the marketplace.

    Encodes the WAV render to MP3 via ffmpeg, commits
    marketplace/<slug>.mp3 + marketplace/<slug>.mid to the HSE GitHub
    repo (update-if-exists), then syncs the catalog so the listing
    appears immediately. When title/composer are provided they override
    the slug-derived metadata on the synced listing.

    Returns {"published": True, "slug": slug, "listing": {...}}.
    Raises PublishError on any failure (mapped to HTTP by the route).
    """
    if not SLUG_RE.match(slug):
        raise PublishError(422, "slug must match ^[a-z0-9-]+$")
    if not _github_token():
        raise PublishError(503, "GITHUB_TOKEN not configured")
    mp3_bytes = encode_wav_to_mp3(wav_bytes)
    folder = _marketplace_dir()
    message = "marketplace: publish {}".format(slug)
    _github_put_file("{}/{}.mp3".format(folder, slug), mp3_bytes, message)
    _github_put_file("{}/{}.mid".format(folder, slug), midi_bytes, message)
    try:
        sync_from_github_repo()
    except SyncError as exc:
        # The commit landed but the catalog refresh failed; surface a
        # clear 502 so the client knows the files are in the repo.
        raise PublishError(502, str(exc))
    listing = find_listing_by_slug(slug)
    if listing is not None and (title or composer):
        updated = listing.model_copy(
            update={
                "title": title or listing.title,
                "composer": composer or listing.composer,
            }
        )
        try:
            listing = update_listing(listing.id, updated) or updated
        except DuplicateListingError:
            # Another listing already uses the requested (title,
            # composer); keep the slug-derived metadata.
            pass
    return {"published": True, "slug": slug, "listing": listing}


def hmac_verify(
    raw_body: bytes, signature_header: Optional[str], secret: str
) -> bool:
    """Constant-time HMAC-SHA256 check of X-Hub-Signature-256.

    Accepts both "sha256=<hex>" and bare hex header values.
    """
    if not signature_header:
        return False
    header = signature_header.strip()
    if header.startswith("sha256="):
        header = header[len("sha256="):]
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header, digest)


def parse_commit_message(message: str) -> Optional[Dict[str, str]]:
    """Parse a commit message following the marketplace convention.

    First line: "marketplace: <title> by <composer>"
    Optional body lines: key:, tempo:, form:, audio_url:, cover_url:

    Returns None if the message does not follow the convention.
    """
    if not message:
        return None
    lines = message.splitlines()
    first = lines[0].strip()
    if not first.lower().startswith("marketplace:"):
        return None
    rest = first[len("marketplace:"):].strip()
    if " by " not in rest:
        return None
    title, composer = rest.rsplit(" by ", 1)
    title = title.strip()
    composer = composer.strip()
    if not title or not composer:
        return None
    data: Dict[str, str] = {"title": title, "composer": composer}
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        for field in ("key", "tempo", "form", "audio_url", "cover_url"):
            if line.lower().startswith(field + ":"):
                value = line[len(field) + 1:].strip()
                if value:
                    data[field] = value
                break
    return data


def _extract_commit_message(payload: Dict[str, Any]) -> Optional[str]:
    """Pull the commit message from a GitHub push event payload."""
    head = payload.get("head_commit")
    if isinstance(head, dict) and isinstance(head.get("message"), str):
        return head["message"]
    commits = payload.get("commits")
    if isinstance(commits, list) and commits:
        last = commits[-1]
        if isinstance(last, dict) and isinstance(last.get("message"), str):
            return last["message"]
    return None


def handle_github_push(
    raw_body: bytes, signature_header: Optional[str], ref: Optional[str]
) -> Dict[str, Any]:
    """Verify and ingest a GitHub push event.

    Order: secret check (503), signature check (401), body-size cap
    (400), JSON parse (400), branch gate (ignored), marketplace commit
    gate (ignored), repo-tree sync (synced). The repo tree is the
    source of truth, so a marketplace: commit triggers a full
    sync_from_github_repo() rather than a per-commit upsert.
    """
    secret = os.environ.get("MARKETPLACE_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise WebhookError(503, "webhook secret not configured")
    if not hmac_verify(raw_body, signature_header, secret):
        raise WebhookError(401, "invalid signature")
    if len(raw_body) > MAX_WEBHOOK_BODY_BYTES:
        raise WebhookError(400, "payload exceeds 1 MB limit")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise WebhookError(400, "malformed JSON payload")
    if not isinstance(payload, dict):
        raise WebhookError(400, "malformed JSON payload")
    branch = os.environ.get("MARKETPLACE_WEBHOOK_BRANCH", "refs/heads/main")
    if ref != branch:
        return {"ignored": True}
    message = _extract_commit_message(payload)
    if message is None:
        return {"ignored": True}
    if not message.lstrip().lower().startswith("marketplace:"):
        return {"ignored": True}
    try:
        summary = sync_from_github_repo()
    except SyncError as exc:
        raise WebhookError(502, str(exc))
    return {"synced": True, **summary}