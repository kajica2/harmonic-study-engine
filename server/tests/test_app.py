"""Smoke test for the FastAPI app — minimal, just confirms pytest
infrastructure is wired correctly. Real coverage goes in the
session-B tests (test_health.py, test_synthesize.py, etc.)."""


def test_app_loads():
    """The app object imported successfully and routes registered."""
    from server.app import app

    paths = {r.path for r in app.routes if hasattr(r, "path")}
    # Every real API route we ship should be present. If a route
    # is removed accidentally this list will catch it.
    assert "/health" in paths
    assert "/synthesize" in paths
    assert "/fx/reverb" in paths
    assert "/recordings/upload" in paths


def test_root_serves_404_when_no_static(client):
    """Without server/static/dist/, GET / returns 404 not 500."""
    resp = client.get("/")
    # Either 404 (frontend not built) or 200 (built) is acceptable —
    # what matters is that the request doesn't 500.
    assert resp.status_code in (200, 404)