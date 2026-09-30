"""Vercel serverless function: GET /api/listings.

Fetches the HSE GitHub repo's marketplace/ folder via the GitHub API
(public, no token needed, but GITHUB_TOKEN is used when present for a
higher rate limit) and returns the catalog as a JSON array of
{slug, title, mp3_url, midi_url} with raw.githubusercontent.com URLs.

The repo folder is the catalog source of truth: each package is a
marketplace/<slug>.mp3 + marketplace/<slug>.mid pair. Slugs missing
either file are skipped.

Python 3.9 compatible, stdlib only. The handler follows the Vercel
file-based Python convention: a `handler` class inheriting from
BaseHTTPRequestHandler (api/listings.py maps to /api/listings).
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GITHUB_API_BASE = "https://api.github.com"
GITHUB_RAW_BASE = "https://raw.githubusercontent.com"
GITHUB_TREE_TIMEOUT_SECONDS = 15


class ListingsError(Exception):
    """A listings failure that maps to an HTTP status code."""

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


def humanize_slug(slug):
    """Turn a file slug into a display title.

    Replaces dashes and underscores with spaces and title-cases the
    result, so "autumn-leaves" becomes "Autumn Leaves".
    """
    return slug.replace("-", " ").replace("_", " ").strip().title()


def fetch_tree():
    """Fetch the recursive git tree for the configured repo and branch.

    GET /repos/{repo}/git/trees/{branch}?recursive=1 via stdlib
    urllib. An optional GITHUB_TOKEN env var is sent as a Bearer
    header when present (public repos work without it, but the rate
    limit is lower). The token is never logged. Raises ListingsError
    on transport or HTTP errors and on malformed JSON.
    """
    url = "{}/repos/{}/git/trees/{}?recursive=1".format(
        GITHUB_API_BASE, github_repo(), github_branch()
    )
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "harmonic-study-engine-marketplace",
    }
    token = github_token()
    if token:
        headers["Authorization"] = "Bearer {}".format(token)
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=GITHUB_TREE_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        raise ListingsError(
            502, "GitHub API returned HTTP {} for {}".format(exc.code, url)
        )
    except URLError as exc:
        raise ListingsError("GitHub API request failed: {}".format(exc.reason))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ListingsError("GitHub API returned malformed JSON")


def listings_from_tree(tree):
    """Group marketplace/<slug>.mp3 + .mid entries into catalog items.

    Returns a list of {slug, title, mp3_url, midi_url} for slugs that
    have BOTH files, sorted by slug. Nested subdirectories are not
    catalog entries.
    """
    prefix = marketplace_dir() + "/"
    mp3_slugs = set()
    mid_slugs = set()
    for entry in tree.get("tree", []):
        path = entry.get("path", "")
        if not path.startswith(prefix):
            continue
        name = path[len(prefix):]
        if "/" in name:
            continue
        if name.endswith(".mp3"):
            mp3_slugs.add(name[:-len(".mp3")])
        elif name.endswith(".mid"):
            mid_slugs.add(name[:-len(".mid")])

    repo = github_repo()
    branch = github_branch()
    folder = marketplace_dir()
    items = []
    for slug in sorted(mp3_slugs & mid_slugs):
        items.append(
            {
                "slug": slug,
                "title": humanize_slug(slug),
                "mp3_url": "{}/{}/{}/{}/{}.mp3".format(
                    GITHUB_RAW_BASE, repo, branch, folder, slug
                ),
                "midi_url": "{}/{}/{}/{}/{}.mid".format(
                    GITHUB_RAW_BASE, repo, branch, folder, slug
                ),
            }
        )
    return items


class handler(BaseHTTPRequestHandler):
    """Vercel file-based Python function for GET /api/listings."""

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

    def do_GET(self):
        try:
            tree = fetch_tree()
            if tree.get("truncated"):
                raise ListingsError(502, "GitHub tree response was truncated")
            self._send_json(200, listings_from_tree(tree))
        except ListingsError as exc:
            self._send_json(exc.status_code, {"error": exc.detail})
        except Exception:
            self._send_json(500, {"error": "internal error"})