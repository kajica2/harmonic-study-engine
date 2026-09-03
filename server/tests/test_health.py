"""Contract tests for the /health endpoint."""

import pytest


class TestHealth:
    """GET /health returns the API status. The actual branch (ok vs
    degraded) depends on whether DDSP is installed in the venv. Both
    branches must:
      - return HTTP 200
      - return JSON with `status` and `ddsp_version` fields
    """

    def test_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_returns_json_with_required_fields(self, client):
        resp = client.get("/health")
        body = resp.json()
        assert "status" in body
        assert "ddsp_version" in body

    def test_status_is_ok_or_degraded(self, client):
        # The app explicitly models these two states. Any other
        # value means a code path is reporting something unexpected.
        resp = client.get("/health")
        assert resp.json()["status"] in ("ok", "degraded")

    def test_ddsp_version_matches_status(self, client):
        """If status=ok, ddsp_version must be a non-empty string
        (the ddsp package's __version__). If status=degraded,
        ddsp_version must be the sentinel 'unavailable' string."""
        body = client.get("/health").json()
        if body["status"] == "ok":
            assert body["ddsp_version"] and body["ddsp_version"] != "unavailable"
        else:
            assert body["ddsp_version"] == "unavailable"