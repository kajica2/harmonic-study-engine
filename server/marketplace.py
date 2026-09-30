"""Marketplace backend: sqlite3 storage, CRUD, and GitHub webhook ingestion.

Listings are stored in a sqlite database at MARKETPLACE_DB_PATH (default
./marketplace.db). The schema is created at module import. All env vars
are read at call time (not import time) so tests can monkeypatch them
per-test. The webhook secret and signature are never logged.
"""

import hashlib
import hmac
import json
import os
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple
from urllib.parse import urlparse

from pydantic import BaseModel, Field, ValidationError, field_validator

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


def _extract_commit_sha(payload: Dict[str, Any]) -> Optional[str]:
    """Pull the commit sha from a GitHub push event payload."""
    head = payload.get("head_commit")
    if isinstance(head, dict) and isinstance(head.get("id"), str):
        return head["id"]
    commits = payload.get("commits")
    if isinstance(commits, list) and commits:
        last = commits[-1]
        if isinstance(last, dict) and isinstance(last.get("id"), str):
            return last["id"]
    return None


def handle_github_push(
    raw_body: bytes, signature_header: Optional[str], ref: Optional[str]
) -> Dict[str, Any]:
    """Verify and ingest a GitHub push event.

    Order: secret check (503), signature check (401), body-size cap
    (400), JSON parse (400), branch gate (ignored), commit parse
    (ignored), upsert (created/updated).
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
    parsed = parse_commit_message(message)
    if parsed is None:
        return {"ignored": True}
    parsed["source_commit"] = _extract_commit_sha(payload)
    try:
        listing = MarketplaceListing(**parsed)
    except ValidationError:
        return {"ignored": True}
    action, saved = upsert_listing(listing)
    return {action: True, "listing": saved.model_dump()}