"""Contract tests for CORS configuration. The backend's CORSMiddleware
reads origins from DDSP_CORS_ORIGINS env var (comma-separated) or
falls back to the default list. These tests verify both paths."""

import importlib
from typing import Optional

import pytest


@pytest.fixture
def reload_app_with_env(monkeypatch):
    """Re-import server.app with DDSP_CORS_ORIGINS set/unset.
    Required since the origins list is computed once at module import
    time — not request-time. monkeypatch alone won't work."""
    def _reload(value: Optional[str]):
        if value is None:
            monkeypatch.delenv("DDSP_CORS_ORIGINS", raising=False)
        else:
            monkeypatch.setenv("DDSP_CORS_ORIGINS", value)
        # Force re-import. The app module is already imported once
        # by the `client` fixture; reload() re-runs the body.
        from server import app as app_mod
        importlib.reload(app_mod)
        return app_mod.app

    yield _reload


class TestCors:
    """CORS preflight (OPTIONS) on each route returns the right
    Access-Control-Allow-Origin header for the configured origins."""

    def test_default_origins_allow_localhost_5173(self, reload_app_with_env):
        """With no DDSP_CORS_ORIGINS env var, the default list
        includes the Vite dev origin (localhost:5173)."""
        reload_app_with_env(None)
        from fastapi.testclient import TestClient
        from server import app as app_mod
        with TestClient(app_mod.app) as c:
            resp = c.options(
                "/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert resp.status_code == 200
            assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"

    def test_default_origins_allow_127_0_0_1_5173(self, reload_app_with_env):
        reload_app_with_env(None)
        from fastapi.testclient import TestClient
        from server import app as app_mod
        with TestClient(app_mod.app) as c:
            resp = c.options(
                "/health",
                headers={
                    "Origin": "http://127.0.0.1:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert resp.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"

    def test_default_origins_reject_unlisted_origin(self, reload_app_with_env):
        """Origins not in the default list (e.g. an attacker's
        domain) must NOT receive the allow-origin header. The
        browser will then block the request."""
        reload_app_with_env(None)
        from fastapi.testclient import TestClient
        from server import app as app_mod
        with TestClient(app_mod.app) as c:
            resp = c.options(
                "/health",
                headers={
                    "Origin": "http://evil.example.com",
                    "Access-Control-Request-Method": "GET",
                },
            )
            # CORSMiddleware omits the allow-origin header for
            # unlisted origins (or echoes "*", which we should
            # NOT see — that's a security issue with credentials).
            assert "evil.example.com" not in resp.headers.get(
                "access-control-allow-origin", ""
            )

    def test_env_var_overrides_default_list(self, reload_app_with_env):
        """DDSP_CORS_ORIGINS=https://app.vercel.app,https://app.example.com
        should restrict to exactly those two origins, dropping the
        default localhost entries."""
        reload_app_with_env("https://app.vercel.app,https://app.example.com")
        from fastapi.testclient import TestClient
        from server import app as app_mod
        with TestClient(app_mod.app) as c:
            # Allowed
            resp = c.options(
                "/health",
                headers={
                    "Origin": "https://app.vercel.app",
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert resp.headers["access-control-allow-origin"] == "https://app.vercel.app"
            # Disallowed — localhost no longer in the list
            resp = c.options(
                "/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert "localhost" not in resp.headers.get(
                "access-control-allow-origin", ""
            )

    def test_empty_env_var_falls_back_to_defaults(self, reload_app_with_env):
        """DDSP_CORS_ORIGINS='' (empty string, not unset) — the
        endpoint treats it as 'no override' and uses defaults."""
        reload_app_with_env("")
        from fastapi.testclient import TestClient
        from server import app as app_mod
        with TestClient(app_mod.app) as c:
            resp = c.options(
                "/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"

    def test_actual_get_request_returns_cors_header(self, reload_app_with_env):
        """CORS also attaches to non-preflight GETs (the browser
        checks before letting the JS read the response)."""
        reload_app_with_env(None)
        from fastapi.testclient import TestClient
        from server import app as app_mod
        with TestClient(app_mod.app) as c:
            resp = c.get("/health", headers={"Origin": "http://localhost:5173"})
            assert resp.status_code == 200
            assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"