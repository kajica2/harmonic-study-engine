"""Tests for the marketplace backend: CRUD endpoints, GitHub webhook
ingestion, HMAC verification, and commit-message parsing.

Isolation: every test points MARKETPLACE_DB_PATH at a tmp_path file and
sets MARKETPLACE_WEBHOOK_SECRET via monkeypatch. The shared client
fixture imports server.app once; env vars are read at call time by
server/marketplace.py, so per-test monkeypatching is honored.
"""

import base64
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
            message = "marketplace: Autumn Leaves by Joseph Kosma"
        return json.dumps(
            {"ref": ref, "head_commit": {"id": "abc123", "message": message}}
        ).encode("utf-8")

    def _post(self, client, body, secret="test-secret"):
        headers = {"X-Hub-Signature-256": _sign(body, secret)}
        return client.post("/webhooks/github", content=body, headers=headers)

    def _fake_sync(self, created=1, updated=0):
        return {"created": created, "updated": updated, "skipped": 0, "errors": []}

    def test_marketplace_commit_triggers_sync(self, client, marketplace_env, monkeypatch):
        from server.marketplace import sync_from_github_repo

        calls = []

        def fake_sync():
            calls.append(1)
            return self._fake_sync()

        monkeypatch.setattr("server.marketplace.sync_from_github_repo", fake_sync)
        body = self._push_body()
        resp = self._post(client, body)
        assert resp.status_code == 200
        result = resp.json()
        assert result["synced"] is True
        assert result["created"] == 1
        assert result["updated"] == 0
        assert result["errors"] == []
        assert calls == [1]

    def test_repeated_delivery_triggers_sync_each_time(
        self, client, marketplace_env, monkeypatch
    ):
        from server.marketplace import sync_from_github_repo

        state = {"n": 0}

        def fake_sync():
            state["n"] += 1
            if state["n"] == 1:
                return self._fake_sync(created=1, updated=0)
            return self._fake_sync(created=0, updated=1)

        monkeypatch.setattr("server.marketplace.sync_from_github_repo", fake_sync)
        body = self._push_body()
        first = self._post(client, body).json()
        second = self._post(client, body).json()
        assert first["created"] == 1
        assert second["updated"] == 1
        assert state["n"] == 2

    def test_marketplace_commit_without_structured_body_triggers_sync(
        self, client, marketplace_env, monkeypatch
    ):
        # The repo tree is the source of truth, so a bare "marketplace:"
        # commit still triggers a full sync even without key/tempo/audio_url
        # body lines.
        from server.marketplace import sync_from_github_repo

        calls = []

        def fake_sync():
            calls.append(1)
            return self._fake_sync()

        monkeypatch.setattr("server.marketplace.sync_from_github_repo", fake_sync)
        body = self._push_body(message="marketplace: No Audio by Nobody")
        resp = self._post(client, body)
        assert resp.status_code == 200
        assert resp.json()["synced"] is True
        assert calls == [1]

    def test_marketplace_commit_sync_failure_502(
        self, client, marketplace_env, monkeypatch
    ):
        from server.marketplace import SyncError, sync_from_github_repo

        def boom():
            raise SyncError("GitHub API returned HTTP 403 for ...")

        monkeypatch.setattr("server.marketplace.sync_from_github_repo", boom)
        body = self._push_body()
        resp = self._post(client, body)
        assert resp.status_code == 502

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


class TestGithubRepoSync:
    """Tests for sync_from_github_repo and the POST /marketplace/sync endpoint.

    The GitHub API call is replaced by monkeypatching
    server.marketplace._fetch_github_tree with a fake tree, so no test
    touches the network.
    """

    def _fake_tree(self, sha="tree-sha-123"):
        return {
            "sha": sha,
            "tree": [
                {"path": "marketplace/stella.mp3", "type": "blob"},
                {"path": "marketplace/stella.mid", "type": "blob"},
                {"path": "marketplace/solar.mp3", "type": "blob"},
                {"path": "README.md", "type": "blob"},
            ],
        }

    def test_sync_upserts_complete_pairs_and_skips_incomplete(
        self, marketplace_env, monkeypatch
    ):
        from server.marketplace import list_listings, sync_from_github_repo

        monkeypatch.setattr(
            "server.marketplace._fetch_github_tree", lambda: self._fake_tree()
        )
        summary = sync_from_github_repo()
        assert summary["created"] == 1
        assert summary["updated"] == 0
        assert summary["skipped"] == 1
        assert summary["errors"] == []

        rows = list_listings()
        assert len(rows) == 1
        row = rows[0]
        assert row.title == "Stella"
        assert row.composer == "harmonic-study-engine"
        assert (
            row.audio_url
            == "https://raw.githubusercontent.com/kajica2/harmonic-study-engine/main/marketplace/stella.mp3"
        )
        assert row.cover_url is None
        assert row.key is None
        assert row.tempo is None
        assert row.form is None
        assert row.status == "published"
        assert row.source_commit == "tree-sha-123"

    def test_sync_is_idempotent(self, marketplace_env, monkeypatch):
        from server.marketplace import list_listings, sync_from_github_repo

        monkeypatch.setattr(
            "server.marketplace._fetch_github_tree", lambda: self._fake_tree()
        )
        first = sync_from_github_repo()
        second = sync_from_github_repo()
        assert first["created"] == 1
        assert first["updated"] == 0
        assert second["created"] == 0
        assert second["updated"] == 1
        assert len(list_listings()) == 1

    def test_sync_humanizes_slug_title(self, marketplace_env, monkeypatch):
        from server.marketplace import list_listings, sync_from_github_repo

        tree = {
            "sha": "abc",
            "tree": [
                {"path": "marketplace/autumn-leaves.mp3", "type": "blob"},
                {"path": "marketplace/autumn-leaves.mid", "type": "blob"},
            ],
        }
        monkeypatch.setattr("server.marketplace._fetch_github_tree", lambda: tree)
        sync_from_github_repo()
        rows = list_listings()
        assert rows[0].title == "Autumn Leaves"

    def test_sync_endpoint_returns_summary(self, client, marketplace_env, monkeypatch):
        monkeypatch.setattr(
            "server.marketplace._fetch_github_tree", lambda: self._fake_tree()
        )
        resp = client.post("/marketplace/sync")
        assert resp.status_code == 200
        body = resp.json()
        assert body["created"] == 1
        assert body["updated"] == 0
        assert body["skipped"] == 1
        assert body["errors"] == []

    def test_sync_endpoint_502_on_fetch_failure(
        self, client, marketplace_env, monkeypatch
    ):
        from server.marketplace import SyncError

        def boom():
            raise SyncError("GitHub API returned HTTP 403 for ...")

        monkeypatch.setattr("server.marketplace._fetch_github_tree", boom)
        resp = client.post("/marketplace/sync")
        assert resp.status_code == 502
        assert "GitHub API" in resp.json()["detail"]

    def test_fetch_github_tree_sends_token_header_when_set(self, monkeypatch):
        import json as _json

        from server.marketplace import _fetch_github_tree

        captured = {}

        class FakeResponse:
            def read(self):
                return _json.dumps({"sha": "s", "tree": []}).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def fake_urlopen(request, timeout):
            captured["headers"] = request.headers
            captured["url"] = request.full_url
            return FakeResponse()

        monkeypatch.setenv("GITHUB_TOKEN", "secret-token")
        monkeypatch.setattr("server.marketplace.urlopen", fake_urlopen)
        tree = _fetch_github_tree()
        assert tree == {"sha": "s", "tree": []}
        assert captured["headers"]["Authorization"] == "Bearer secret-token"
        assert "api.github.com" in captured["url"]

    def test_fetch_github_tree_omits_auth_header_without_token(self, monkeypatch):
        import json as _json

        from server.marketplace import _fetch_github_tree

        captured = {}

        class FakeResponse:
            def read(self):
                return _json.dumps({"sha": "s", "tree": []}).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def fake_urlopen(request, timeout):
            captured["headers"] = request.headers
            return FakeResponse()

        monkeypatch.delenv("GITHUB_TOKEN", raising=False)
        monkeypatch.setattr("server.marketplace.urlopen", fake_urlopen)
        _fetch_github_tree()
        assert "Authorization" not in captured["headers"]


class TestMarketplacePublish:
    """Tests for POST /marketplace/publish.

    The ffmpeg encode and GitHub API calls are replaced by
    monkeypatching server.marketplace.encode_wav_to_mp3 and
    server.marketplace._github_put_file / _github_get_file_sha, so no
    test touches the network or a real ffmpeg binary. The repo-tree
    sync runs for real against a mocked _fetch_github_tree so the
    listing round-trip (commit -> sync -> listing) is exercised.
    """

    def _wav_bytes(self):
        # Minimal RIFF/WAVE header (12 bytes) - enough for the magic
        # byte check in the endpoint.
        return b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"data"

    def _midi_bytes(self):
        return b"MThd" + b"\x00\x00\x00\x06" + b"\x00\x00\x00\x00"

    def _mp3_bytes(self):
        return b"ID3" + b"\x00" * 8

    def _fake_tree(self, slug):
        return {
            "sha": "tree-sha-publish",
            "tree": [
                {"path": "marketplace/{}.mp3".format(slug), "type": "blob"},
                {"path": "marketplace/{}.mid".format(slug), "type": "blob"},
            ],
        }

    def _publish(
        self,
        client,
        slug="my-tune",
        title="My Tune",
        composer="Me",
        audio=None,
        midi=None,
    ):
        return client.post(
            "/marketplace/publish",
            files={
                "audio": (
                    "render.wav",
                    audio if audio is not None else self._wav_bytes(),
                    "audio/wav",
                ),
                "midi": (
                    "render.mid",
                    midi if midi is not None else self._midi_bytes(),
                    "audio/midi",
                ),
            },
            data={"slug": slug, "title": title, "composer": composer},
        )

    def test_publish_happy_path(self, client, marketplace_env, monkeypatch):
        from server.marketplace import (
            _fetch_github_tree,
            _github_put_file,
            encode_wav_to_mp3,
        )

        monkeypatch.setenv("GITHUB_TOKEN", "test-token")
        monkeypatch.setattr(
            "server.marketplace.encode_wav_to_mp3", lambda wav: self._mp3_bytes()
        )
        calls = []
        monkeypatch.setattr(
            "server.marketplace._github_put_file",
            lambda path, content, message, sha=None: calls.append(
                (path, content, message, sha)
            ),
        )
        monkeypatch.setattr(
            "server.marketplace._fetch_github_tree", lambda: self._fake_tree("my-tune")
        )

        resp = self._publish(client)
        assert resp.status_code == 200
        body = resp.json()
        assert body["published"] is True
        assert body["slug"] == "my-tune"
        assert body["listing"]["title"] == "My Tune"
        assert body["listing"]["composer"] == "Me"
        assert body["listing"]["audio_url"].endswith("/marketplace/my-tune.mp3")
        # Both files committed with the marketplace: publish message.
        assert [c[0] for c in calls] == [
            "marketplace/my-tune.mp3",
            "marketplace/my-tune.mid",
        ]
        assert all(c[2] == "marketplace: publish my-tune" for c in calls)
        assert all(c[3] is None for c in calls)

    def test_publish_missing_token_503(self, client, marketplace_env, monkeypatch):
        monkeypatch.delenv("GITHUB_TOKEN", raising=False)
        resp = self._publish(client)
        assert resp.status_code == 503
        assert "GITHUB_TOKEN" in resp.json()["detail"]

    def test_publish_bad_slug_422(self, client, marketplace_env, monkeypatch):
        monkeypatch.setenv("GITHUB_TOKEN", "test-token")
        resp = self._publish(client, slug="Bad Slug!")
        assert resp.status_code == 422

    def test_publish_ffmpeg_failure_500(self, client, marketplace_env, monkeypatch):
        from server.marketplace import PublishError

        monkeypatch.setenv("GITHUB_TOKEN", "test-token")

        def boom(wav):
            raise PublishError(500, "ffmpeg failed: boom")

        monkeypatch.setattr("server.marketplace.encode_wav_to_mp3", boom)
        resp = self._publish(client)
        assert resp.status_code == 500
        assert "ffmpeg" in resp.json()["detail"]

    def test_publish_non_wav_audio_422(self, client, marketplace_env, monkeypatch):
        monkeypatch.setenv("GITHUB_TOKEN", "test-token")
        # A non-WAV content-type AND non-WAV magic bytes must be
        # rejected. (A WAV content-type alone passes the check by
        # design - the endpoint trusts the declared type.)
        resp = client.post(
            "/marketplace/publish",
            files={
                "audio": ("render.bin", b"not a wav at all", "application/octet-stream"),
                "midi": ("render.mid", self._midi_bytes(), "audio/midi"),
            },
            data={"slug": "my-tune"},
        )
        assert resp.status_code == 422

    def test_publish_missing_midi_422(self, client, marketplace_env, monkeypatch):
        monkeypatch.setenv("GITHUB_TOKEN", "test-token")
        resp = self._publish(client, midi=b"")
        assert resp.status_code == 422

    def test_publish_commit_then_sync_flow(self, client, marketplace_env, monkeypatch):
        from server.marketplace import (
            _github_put_file,
            encode_wav_to_mp3,
            sync_from_github_repo,
        )

        monkeypatch.setenv("GITHUB_TOKEN", "test-token")
        monkeypatch.setattr(
            "server.marketplace.encode_wav_to_mp3", lambda wav: self._mp3_bytes()
        )
        order = []
        monkeypatch.setattr(
            "server.marketplace._github_put_file",
            lambda path, content, message, sha=None: order.append(("commit", path)),
        )
        monkeypatch.setattr(
            "server.marketplace.sync_from_github_repo",
            lambda: order.append(("sync",))
            or {"created": 1, "updated": 0, "skipped": 0, "errors": []},
        )
        resp = self._publish(client)
        assert resp.status_code == 200
        assert resp.json()["published"] is True
        # Commits happen before the sync, in mp3 then mid order.
        assert order == [
            ("commit", "marketplace/my-tune.mp3"),
            ("commit", "marketplace/my-tune.mid"),
            ("sync",),
        ]

    def test_github_put_file_creates_without_sha(self, monkeypatch):
        from server.marketplace import _github_put_file

        monkeypatch.setenv("GITHUB_TOKEN", "test-token")
        calls = []

        def fake_request(method, url, body=None, timeout=30):
            calls.append((method, url, body))
            return (201, {"content": {"sha": "new-sha"}})

        monkeypatch.setattr("server.marketplace._github_request", fake_request)
        _github_put_file("marketplace/my-tune.mp3", b"ID3", "marketplace: publish my-tune")
        assert calls[0][0] == "PUT"
        assert calls[0][2]["message"] == "marketplace: publish my-tune"
        assert calls[0][2]["content"] == base64.b64encode(b"ID3").decode("ascii")
        assert "sha" not in calls[0][2]

    def test_github_put_file_409_updates_with_sha(self, monkeypatch):
        from server.marketplace import _github_put_file

        monkeypatch.setenv("GITHUB_TOKEN", "test-token")
        responses = [
            (409, {"message": "sha mismatch"}),
            (200, {"sha": "existing-sha"}),
            (200, {"content": {"sha": "new-sha"}}),
        ]
        calls = []

        def fake_request(method, url, body=None, timeout=30):
            calls.append((method, url, body))
            return responses.pop(0)

        monkeypatch.setattr("server.marketplace._github_request", fake_request)
        _github_put_file("marketplace/my-tune.mp3", b"ID3", "marketplace: publish my-tune")
        # First PUT without sha (409), then a GET for the sha, then a
        # PUT with the fetched sha.
        assert [c[0] for c in calls] == ["PUT", "GET", "PUT"]
        assert "sha" not in calls[0][2]
        assert calls[2][2]["sha"] == "existing-sha"


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