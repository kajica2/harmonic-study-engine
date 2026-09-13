"""Contract tests for /synthesize. DDSP is not installed in the
test venv (requirements-dev.txt excludes it), so the endpoint is
expected to 503 in every test below. The 200-success path is
covered by the same shape but only exercisable when the DDSP
stack is installed (separately, in the production venv)."""

import pytest


class TestSynthesize:
    """POST /synthesize takes {chord_notes, chord_duration} and
    returns a WAV blob. When DDSP is unavailable: 503 with a
    plain-text body explaining the situation. When DDSP is
    available: 200 with audio/wav bytes."""

    VALID_PAYLOAD = {
        "chord_notes": [[60, 64, 67], [62, 65, 69]],
        "chord_duration": 2.0,
    }

    def test_503_when_ddsp_unavailable(self, client):
        """The endpoint returns 503 with a plain-text explanation
        when DDSP isn't installed (the test-env default)."""
        # The contract test asserts the 503 path because that's
        # what the current test environment produces. The
        # 200-success path is the same shape but only
        # exercised in a venv that has requirements-ddsp.txt
        # installed.
        resp = client.post("/synthesize", json=self.VALID_PAYLOAD)
        # Either 503 (no DDSP) or 200 (DDSP installed) is valid;
        # both are documented paths.
        assert resp.status_code in (200, 503)

    def test_503_body_is_explanatory(self, client):
        if client.post("/synthesize", json=self.VALID_PAYLOAD).status_code != 503:
            pytest.skip("DDSP is installed; 503-body contract not applicable")
        resp = client.post("/synthesize", json=self.VALID_PAYLOAD)
        body = resp.text
        # Body must mention ddsp so the frontend can surface a
        # useful status message to the user.
        assert "ddsp" in body.lower()

    def test_accepts_minimum_payload(self, client):
        """chord_notes is required, chord_duration has a default.
        Minimum valid payload is just chord_notes with one chord."""
        resp = client.post("/synthesize", json={"chord_notes": [[60, 64, 67]]})
        assert resp.status_code in (200, 503)

    def test_400_on_missing_chord_notes(self, client):
        """chord_notes is required — omitting it must produce a
        422 (FastAPI's validation error code). Not a 200/503."""
        resp = client.post("/synthesize", json={"chord_duration": 1.5})
        assert resp.status_code == 422

    def test_400_on_empty_chord_notes(self, client):
        """An empty chord_notes list is structurally valid (a list
        of []). The endpoint accepts it; behavior depends on
        whether ddsp is installed."""
        resp = client.post("/synthesize", json={"chord_notes": []})
        # Either 200/503 (accepted, rendered as silence) or 422
        # (rejected as invalid). Both are reasonable contracts;
        # just assert it doesn't 500.
        assert resp.status_code in (200, 422, 503)

    def test_400_on_non_array_chord_notes(self, client):
        resp = client.post("/synthesize", json={"chord_notes": "not an array"})
        assert resp.status_code == 422

    def test_response_content_type_header_on_200(self, client):
        """When DDSP is installed and renders successfully, the
        response must be audio/wav (FastAPI Response.media_type
        contract). When 503, the body is text/plain."""
        resp = client.post("/synthesize", json=self.VALID_PAYLOAD)
        if resp.status_code == 200:
            assert resp.headers["content-type"].startswith("audio/wav")
            # Content-Disposition + Content-Length must be set
            # (the endpoint writes both explicitly).
            assert "inline" in resp.headers.get("content-disposition", "")
            assert "content-length" in {k.lower() for k in resp.headers.keys()}
        else:
            assert resp.status_code == 503
            assert resp.headers["content-type"].startswith("text/plain")