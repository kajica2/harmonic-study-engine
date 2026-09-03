"""Shared pytest fixtures for the backend test suite.

Fixtures defined here are auto-discovered by pytest and available
to every test file in server/tests/. Per-file `client` fixtures
would shadow these; keep them in this one place.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """TestClient runs the ASGI app in-process.

    Sync (not async via httpx.AsyncClient) because the endpoints
    we test are either synchronous handlers or async handlers that
    FastAPI runs in a threadpool anyway — TestClient handles both.
    """
    from server.app import app
    with TestClient(app) as c:
        yield c