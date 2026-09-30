"""Tests for the marketplace backend: CRUD endpoints, GitHub webhook
ingestion, HMAC verification, and commit-message parsing.

Isolation: every test points MARKETPLACE_DB_PATH at a tmp_path file and
sets MARKETPLACE_WEBHOOK_SECRET via monkeypatch. The shared client
fixture imports server.app once; env vars are read at call time by
server/marketplace.py, so per-test monkeypatching is honored.
"""

import hashlib
import hmac
import json
import time

import pytest


def _sign(body: bytes, secret: str) -> str:
    """Build an X-Hub-Signature-256 header value for a body."""
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return "sha256={}".format(digest)


@pytest.fixture
def marketplace_env(tmp_path, monkeypatch):
    """Point the marketplace DB at a temp file and set webhook env."""
    monkeypatch.setenv("MARKETPLACE_DB_PATH", str(tmp_path / "marketplace.db"))
    monkeypatch.setenv("MARKETPLACE_WEBHOOK_SECRET", "test-secret")
    monkeypatch.setenv("MARKETPLACE_WEBHOOK_BRANCH", "refs/heads/main")
    yield


def _listing_payload(**overrides):
    payload = {
        "title": "Autumn Leaves",
        "composer": "Joseph Kosma",
        "key": "G",
        "tempo": 120,
        "form": "AABA",
        "audio_url": "https://example.com/autumn-leaves.mp3",
        "cover_url": "https://example.com/cover.jpg",
    }
    payload.update(overrides)
    return payload


class TestMarketplaceCrud:
    def test_create_listing_201_and_persisted(self, client, marketplace_env):
        resp = client.post("/marketplace/listings", json=_listing_payload())
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Autumn Leaves"
        assert body["composer"] == "Joseph Kosma"
        assert body["key"] == "G"
        assert body["tempo"] == 120
        assert body["form"] == "AABA"
        assert body["status"] == "published"
        assert body["id"]
        assert body["created_at"]
        assert body["updated_at"]
        # Persisted: a follow-up GET returns the same row.
        got = client.get("/marketplace/listings/{}".format(body["id"]))
        assert got.status_code == 200
        assert got.json()["title"] == "Autumn Leaves"

    def test_create_trims_title_and_composer(self, client, marketplace_env):
        resp = client.post(
            "/marketplace/listings",
            json=_listing_payload(title="  Autumn Leaves  ", composer="  Kosma  "),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Autumn Leaves"
        assert body["composer"] == "Kosma"

    def test_list_defaults_to_published(self, client, marketplace_env):
        client.post(
            "/marketplace/listings",
            json=_listing_payload(title="One", status="published"),
        )
        client.post(
            "/marketplace/listings",
            json=_listing_payload(title="Two", status="archived"),
        )
        resp = client.get("/marketplace/listings")
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["One"]

    def test_list_filters_by_status(self, client, marketplace_env):
        client.post(
            "/marketplace/listings",
            json=_listing_payload(title="One", status="published"),
        )
        client.post(
            "/marketplace/listings",
            json=_listing_payload(title="Two", status="archived"),
        )
        archived = client.get(
            "/marketplace/listings", params={"status": "archived"}
        ).json()
        assert [item["title"] for item in archived] == ["Two"]

    def test_list_orders_by_created_at_desc(self, client, marketplace_env):
        client.post("/marketplace/listings", json=_listing_payload(title="First"))
        time.sleep(1.1)  # created_at has second precision
        client.post("/marketplace/listings", json=_listing_payload(title="Second"))
        titles = [item["title"] for item in client.get("/marketplace/listings").json()]
        assert titles == ["Second", "First"]

    def test_get_listing_404(self, client, marketplace_env):
        resp = client.get("/marketplace/listings/does-not-exist")
        assert resp.status_code == 404

    def test_put_listing_200(self, client, marketplace_env):
        created = client.post(
            "/marketplace/listings", json=_listing_payload()
        ).json()
        resp = client.put(
            "/marketplace/listings/{}".format(created["id"]),
            json=_listing_payload(title="Autumn Leaves (New)", tempo=140),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == created["id"]
        assert body["title"] == "Autumn Leaves (New)"
        assert body["tempo"] == 140
        assert body["created_at"] == created["created_at"]

    def test_put_listing_404(self, client, marketplace_env):
        resp = client.put(
            "/marketplace/listings/does-not-exist",
            json=_listing_payload(),
        )
        assert resp.status_code == 404

    def test_put_collision_409(self, client, marketplace_env):
        first = client.post(
            "/marketplace/listings", json=_listing_payload(title="One")
        ).json()
        second = client.post(
            "/marketplace/listings", json=_listing_payload(title="Two")
        ).json()
        # Renaming Two to One collides with the first row's unique pair.
        resp = client.put(
            "/marketplace/listings/{}".format(second["id"]),
            json=_listing_payload(title="One"),
        )
        assert resp.status_code == 409

    def test_post_duplicate_409(self, client, marketplace_env):
        assert (
            client.post("/marketplace/listings", json=_listing_payload()).status_code
            == 201
        )
        resp = client.post("/marketplace/listings", json=_listing_payload())
        assert resp.status_code == 409

    def test_422_missing_title(self, client, marketplace_env):
        payload = _listing_payload()
        del payload["title"]
        resp = client.post("/marketplace/listings", json=payload)
        assert resp.status_code == 422

    def test_422_bad_audio_url(self, client, marketplace_env):
        resp = client.post(
            "/marketplace/listings",
            json=_listing_payload(audio_url="not-a-url"),
        )
        assert resp.status_code == 422

    def test_422_tempo_out_of_range(self, client, marketplace_env):
        resp = client.post(
            "/marketplace/listings",
            json=_listing_payload(tempo=500),
        )
        assert resp.status_code == 422


class TestGithubWebhook:
    def _push_body(self, message=None, ref="refs/heads/main"):
        if message is None:
            message = (
                "marketplace: Autumn Leaves by Joseph Kosma\n"
                "key: G\n"
                "tempo: 120\n"
                "form: AABA\n"
                "audio_url: https://example.com/autumn-leaves.mp3\n"
                "cover_url: https://example.com/cover.jpg"
            )
        return json.dumps(
            {"ref": ref, "head_commit": {"id": "abc123", "message": message}}
        ).encode("utf-8")

    def _post(self, client, body, secret="test-secret"):
        headers = {"X-Hub-Signature-256": _sign(body, secret)}
        return client.post("/webhooks/github", content=body, headers=headers)

    def test_valid_signature_creates(self, client, marketplace_env):
        body = self._push_body()
        resp = self._post(client, body)
        assert resp.status_code in (200, 201)
        result = resp.json()
        assert result["created"] is True
        assert result["listing"]["title"] == "Autumn Leaves"
        assert result["listing"]["composer"] == "Joseph Kosma"
        assert result["listing"]["source_commit"] == "abc123"

    def test_valid_signature_updates(self, client, marketplace_env):
        body = self._push_body()
        assert self._post(client, body).status_code in (200, 201)
        # Same (title, composer) again -> updated, still one row.
        resp = self._post(client, body)
        assert resp.status_code == 200
        assert resp.json()["updated"] is True

    def test_same_title_composer_once(self, client, marketplace_env):
        body = self._push_body()
        self._post(client, body)
        self._post(client, body)
        listings = client.get("/marketplace/listings").json()
        assert len(listings) == 1

    def test_wrong_signature_401(self, client, marketplace_env):
        body = self._push_body()
        resp = self._post(client, body, secret="wrong-secret")
        assert resp.status_code == 401

    def test_missing_header_401(self, client, marketplace_env):
        body = self._push_body()
        resp = client.post("/webhooks/github", content=body)
        assert resp.status_code == 401

    def test_malformed_json_400(self, client, marketplace_env):
        body = b"{not valid json"
        resp = self._post(client, body)
        assert resp.status_code == 400

    def test_non_main_ref_ignored(self, client, marketplace_env):
        body = self._push_body(ref="refs/heads/dev")
        resp = self._post(client, body)
        assert resp.status_code == 200
        assert resp.json()["ignored"] is True

    def test_unset_secret_503(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("MARKETPLACE_DB_PATH", str(tmp_path / "marketplace.db"))
        monkeypatch.delenv("MARKETPLACE_WEBHOOK_SECRET", raising=False)
        body = self._push_body()
        resp = self._post(client, body)
        assert resp.status_code == 503

    def test_non_marketplace_commit_ignored(self, client, marketplace_env):
        body = self._push_body(message="fix: typo in README")
        resp = self._post(client, body)
        assert resp.status_code == 200
        assert resp.json()["ignored"] is True

    def test_commit_without_audio_url_ignored(self, client, marketplace_env):
        body = self._push_body(message="marketplace: No Audio by Nobody")
        resp = self._post(client, body)
        assert resp.status_code == 200
        assert resp.json()["ignored"] is True

    def test_body_over_1mb_400(self, client, marketplace_env):
        body = b"x" * (1_000_001)
        resp = self._post(client, body)
        assert resp.status_code == 400

    def test_oversized_content_length_400_without_reading_body(
        self, client, marketplace_env
    ):
        # A small, VALID body with a lying oversized Content-Length
        # header. The fast-path rejects on the header alone - the body
        # is never read, so even a valid signed payload gets 400.
        from server.marketplace import MAX_WEBHOOK_BODY_BYTES

        body = self._push_body()
        resp = client.post(
            "/webhooks/github",
            content=body,
            headers={
                "X-Hub-Signature-256": _sign(body, "test-secret"),
                "Content-Length": str(MAX_WEBHOOK_BODY_BYTES + 1),
            },
        )
        assert resp.status_code == 400

    def test_unset_secret_oversized_body_503(self, client, tmp_path, monkeypatch):
        # Precedence pin: the secret check (503) beats the payload-size
        # rejection (400), so an unconfigured server never masks its
        # misconfiguration with a 400 even for an oversized body.
        monkeypatch.setenv("MARKETPLACE_DB_PATH", str(tmp_path / "marketplace.db"))
        monkeypatch.delenv("MARKETPLACE_WEBHOOK_SECRET", raising=False)
        body = b"x" * (1_000_001)
        resp = client.post("/webhooks/github", content=body)
        assert resp.status_code == 503


class TestUpsertListing:
    def test_upsert_creates_then_updates_single_row(self, marketplace_env):
        from server.marketplace import (
            MarketplaceListing,
            list_listings,
            upsert_listing,
        )

        listing = MarketplaceListing(
            title="Race Tune",
            composer="Composer",
            audio_url="https://example.com/race.mp3",
        )
        action, saved = upsert_listing(listing)
        assert action == "created"
        assert saved.id == listing.id

        action2, saved2 = upsert_listing(listing.model_copy(update={"tempo": 140}))
        assert action2 == "updated"
        assert saved2.id == saved.id
        assert saved2.created_at == saved.created_at

        rows = list_listings()
        assert len(rows) == 1
        assert rows[0].tempo == 140

    def test_concurrent_upsert_no_500_single_row(self, marketplace_env):
        import threading

        from server.marketplace import (
            MarketplaceListing,
            list_listings,
            upsert_listing,
        )

        errors = []
        barrier = threading.Barrier(4)

        def worker():
            try:
                listing = MarketplaceListing(
                    title="Race Tune",
                    composer="Composer",
                    audio_url="https://example.com/race.mp3",
                )
                barrier.wait(timeout=5)
                upsert_listing(listing)
            except Exception as exc:  # pragma: no cover - failure path
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert errors == []
        rows = list_listings()
        assert len(rows) == 1


class TestHmacVerify:
    def test_known_vector(self):
        from server.marketplace import hmac_verify

        secret = "key"
        body = b"The quick brown fox jumps over the lazy dog"
        expected = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        assert hmac_verify(body, "sha256={}".format(expected), secret) is True
        # Bare hex (no prefix) is also accepted.
        assert hmac_verify(body, expected, secret) is True
        assert hmac_verify(body, "sha256={}".format(expected), "wrong") is False
        assert hmac_verify(body, None, secret) is False
        assert hmac_verify(body, "sha256=deadbeef", secret) is False


class TestParseCommitMessage:
    def test_full_message(self):
        from server.marketplace import parse_commit_message

        msg = (
            "marketplace: Autumn Leaves by Joseph Kosma\n"
            "key: G\n"
            "tempo: 120\n"
            "form: AABA\n"
            "audio_url: https://example.com/autumn.mp3\n"
            "cover_url: https://example.com/cover.jpg"
        )
        parsed = parse_commit_message(msg)
        assert parsed is not None
        assert parsed["title"] == "Autumn Leaves"
        assert parsed["composer"] == "Joseph Kosma"
        assert parsed["key"] == "G"
        assert parsed["tempo"] == "120"
        assert parsed["form"] == "AABA"
        assert parsed["audio_url"] == "https://example.com/autumn.mp3"
        assert parsed["cover_url"] == "https://example.com/cover.jpg"

    def test_title_containing_by(self):
        from server.marketplace import parse_commit_message

        parsed = parse_commit_message(
            "marketplace: All of Me by Gerald Marks by Seymour Simons"
        )
        assert parsed is not None
        assert parsed["title"] == "All of Me by Gerald Marks"
        assert parsed["composer"] == "Seymour Simons"

    def test_non_marketplace_returns_none(self):
        from server.marketplace import parse_commit_message

        assert parse_commit_message("fix: typo in README") is None
        assert parse_commit_message("") is None
        assert parse_commit_message("marketplace: no composer here") is None