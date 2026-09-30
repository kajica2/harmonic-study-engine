"""Vercel serverless function: POST /api/publish.

Accepts multipart/form-data with:
  - mp3: file (client-side lamejs render, audio/mpeg)
  - midi: file (audio/midi)
  - slug: str (^[a-z0-9-]+$)
  - title / composer: optional str

Commits marketplace/<slug>.mp3 + marketplace/<slug>.mid to the HSE
GitHub repo (kajica2/harmonic-study-engine, main) via the contents
API. The repo folder is the catalog source of truth; there is no
sqlite here because Vercel's filesystem is ephemeral.

Python 3.9 compatible, stdlib only. GITHUB_TOKEN is read at call time
and never logged. The handler follows the Vercel file-based Python
convention: a `handler` class inheriting from BaseHTTPRequestHandler
(api/publish.py maps to /api/publish).
"""

import base64
import json
import os
import re
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SLUG_RE = re.compile(r"^[a-z0-9-]+$")
GITHUB_API_BASE = "https://api.github.com"
GITHUB_TIMEOUT_SECONDS = 30

# Upload caps: a rendered backing track is a few MB; these guard
# against accidental multi-hundred-MB multipart bodies.
MAX_MP3_BYTES = 25 * 1024 * 1024
MAX_MIDI_BYTES = 5 * 1024 * 1024


class PublishError(Exception):
    """A publish failure that maps to an HTTP status code."""

    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def github_repo():
    """Resolve the GitHub repo (owner/name) from env at call time."""
    return os.environ.get("MARKETPLACE_GITHUB_REPO", "kajica2/harmonic-study-engine")


def github_branch():
    """Resolve the GitHub branch from env at call time."""
    return os.environ.get("MARKETPLACE_GITHUB_BRANCH", "main")


def marketplace_dir():
    """Resolve the marketplace folder path inside the repo from env."""
    return os.environ.get("MARKETPLACE_GITHUB_DIR", "marketplace")


def github_token():
    """Resolve the GitHub token from env at call time (never logged)."""
    return os.environ.get("GITHUB_TOKEN", "").strip()


def is_valid_slug(slug):
    """True when the slug matches the marketplace file-name rule."""
    return bool(SLUG_RE.match(slug))


def parse_multipart(content_type, body):
    """Parse a multipart/form-data body into {name: bytes | str}.

    File parts (those with a filename) map to bytes; plain fields map
    to decoded strings. Raises ValueError when the content type is not
    multipart/form-data.
    """
    if not content_type.lower().startswith("multipart/form-data"):
        raise ValueError("expected multipart/form-data")
    msg = BytesParser(policy=policy.default).parsebytes(
        b"Content-Type: " + content_type.encode("utf-8")
        + b"\r\nMIME-Version: 1.0\r\n\r\n"
        + body
    )
    fields = {}
    for part in msg.iter_parts():
        if part.is_multipart():
            continue
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        if part.get_filename():
            fields[name] = payload
        else:
            fields[name] = payload.decode("utf-8", errors="replace")
    return fields


def build_commit_payload(path, content, message, sha=None):
    """Build the GitHub contents-API PUT body for a file.

    The content is base64-encoded; when sha is provided the PUT
    updates the existing file instead of creating a new one.
    """
    payload = {
        "message": message,
        "content": base64.b64encode(content).decode("ascii"),
    }
    if sha:
        payload["sha"] = sha
    return payload


def github_request(method, url, body=None, timeout=GITHUB_TIMEOUT_SECONDS):
    """Perform a GitHub API request with the server-side token.

    Returns (status_code, parsed JSON or raw bytes). Raises
    PublishError(502) on transport failures. The token is never
    logged.
    """
    token = github_token()
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "harmonic-study-engine-marketplace",
    }
    if token:
        headers["Authorization"] = "Bearer {}".format(token)
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
        raise PublishError(
            502, "GitHub API request failed: {}".format(exc.reason)
        )


def contents_url(path):
    """Build the contents-API URL for a repo-relative file path."""
    return "{}/repos/{}/contents/{}".format(GITHUB_API_BASE, github_repo(), path)


def get_file_sha(path):
    """Return the current sha of a repo file, or None when it does not exist.

    The update-if-exists path: a PUT without a sha returns 409 when
    the file already exists, so the current sha is fetched first.
    """
    status, payload = github_request("GET", contents_url(path))
    if status == 404:
        return None
    if status != 200:
        raise PublishError(
            502, "GitHub API returned HTTP {} for {}".format(status, path)
        )
    if isinstance(payload, dict):
        sha = payload.get("sha")
        if isinstance(sha, str) and sha:
            return sha
    raise PublishError(
        502, "GitHub API returned an unexpected payload for {}".format(path)
    )


def put_file(path, content, message):
    """Create or update a file in the repo via the contents API.

    Fetches the current sha first so re-publishing a slug updates the
    files instead of failing with a 409 conflict.
    """
    url = contents_url(path)
    sha = get_file_sha(path)
    status, _ = github_request(
        "PUT", url, body=build_commit_payload(path, content, message, sha)
    )
    if status not in (200, 201):
        raise PublishError(
            502, "GitHub API returned HTTP {} for {}".format(status, path)
        )


def publish(slug, mp3_bytes, midi_bytes, title=None, composer=None):
    """Validate + commit a marketplace package to the GitHub repo.

    Returns {"published": True, "slug": slug}. Raises PublishError on
    validation (422), missing token (503) or GitHub API failures (502).
    """
    if not is_valid_slug(slug):
        raise PublishError(422, "slug must match ^[a-z0-9-]+$")
    if not github_token():
        raise PublishError(503, "GITHUB_TOKEN not configured")
    folder = marketplace_dir()
    message = "marketplace: publish {}".format(slug)
    put_file("{}/{}.mp3".format(folder, slug), mp3_bytes, message)
    put_file("{}/{}.mid".format(folder, slug), midi_bytes, message)
    return {"published": True, "slug": slug}


class handler(BaseHTTPRequestHandler):
    """Vercel file-based Python function for POST /api/publish."""

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        try:
            try:
                content_length = int(self.headers.get("Content-Length", "0") or "0")
            except ValueError:
                content_length = 0
            body = self.rfile.read(content_length) if content_length > 0 else b""
            fields = parse_multipart(self.headers.get("Content-Type", ""), body)

            slug = fields.get("slug", "")
            mp3_bytes = fields.get("mp3")
            midi_bytes = fields.get("midi")
            if not isinstance(mp3_bytes, bytes) or not mp3_bytes:
                raise PublishError(400, "mp3 file field is required")
            if not isinstance(midi_bytes, bytes) or not midi_bytes:
                raise PublishError(400, "midi file field is required")
            if len(mp3_bytes) > MAX_MP3_BYTES:
                raise PublishError(400, "mp3 exceeds 25 MB limit")
            if len(midi_bytes) > MAX_MIDI_BYTES:
                raise PublishError(400, "midi exceeds 5 MB limit")

            title = fields.get("title") or None
            composer = fields.get("composer") or None
            result = publish(slug, mp3_bytes, midi_bytes, title, composer)
            self._send_json(200, result)
        except PublishError as exc:
            self._send_json(exc.status_code, {"error": exc.detail})
        except Exception:
            self._send_json(500, {"error": "internal error"})