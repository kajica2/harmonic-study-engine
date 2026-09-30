"""Tests for the Vercel serverless marketplace functions (api/).

These are Vercel file-based Python functions (BaseHTTPRequestHandler
handlers); the HTTP layer itself is covered by manual deploy
verification. This file pins the extractable pure logic: slug
validation, multipart parsing, GitHub commit payload building, the
publish flow (with the GitHub client monkeypatched), and the
repo-tree grouping.
"""

import base64

import pytest

from api import listings as listings_mod
from api import publish as publish_mod


class TestPublishSlugValidation:
    def test_valid_slugs(self):
        for slug in ("autumn-leaves", "stella", "blue-in-green-2", "a1-b2"):
            assert publish_mod.is_valid_slug(slug)

    def test_invalid_slugs(self):
        for slug in (
            "Bad Slug",
            "UPPER",
            "with_underscore",
            "a b",
            "",
            "s\u0142ug",
            "a.b",
        ):
            assert not publish_mod.is_valid_slug(slug)

    def test_dashes_anywhere_are_valid_per_the_regex(self):
        # The documented rule is ^[a-z0-9-]+$ - dashes may lead or
        # trail; the frontend deriveSlug already trims them.
        assert publish_mod.is_valid_slug("trailing-")
        assert publish_mod.is_valid_slug("-leading")


class TestPublishCommitPayload:
    def test_build_commit_payload_base64_encodes_content(self):
        payload = publish_mod.build_commit_payload(
            "marketplace/x.mp3", b"\x00\x01\x02", "marketplace: publish x"
        )
        assert payload["message"] == "marketplace: publish x"
        assert payload["content"] == base64.b64encode(b"\x00\x01\x02").decode(
            "ascii"
        )
        assert "sha" not in payload

    def test_build_commit_payload_includes_sha_when_provided(self):
        payload = publish_mod.build_commit_payload(
            "marketplace/x.mp3", b"abc", "m", sha="abc123"
        )
        assert payload["sha"] == "abc123"


class TestPublishMultipart:
    def test_parse_multipart_extracts_files_and_fields(self):
        boundary = "----testboundary"
        body = (
            "--{b}\r\n"
            'Content-Disposition: form-data; name="slug"\r\n\r\n'
            "autumn-leaves\r\n"
            "--{b}\r\n"
            'Content-Disposition: form-data; name="mp3"; filename="render.mp3"\r\n'
            "Content-Type: audio/mpeg\r\n\r\n"
            "MP3DATA\r\n"
            "--{b}\r\n"
            'Content-Disposition: form-data; name="midi"; filename="render.mid"\r\n'
            "Content-Type: audio/midi\r\n\r\n"
            "MIDIDATA\r\n"
            "--{b}--\r\n"
        ).format(b=boundary).encode("utf-8")
        fields = publish_mod.parse_multipart(
            "multipart/form-data; boundary={}".format(boundary), body
        )
        assert fields["slug"] == "autumn-leaves"
        assert fields["mp3"] == b"MP3DATA"
        assert fields["midi"] == b"MIDIDATA"

    def test_parse_multipart_omits_optional_fields(self):
        boundary = "----testboundary"
        body = (
            "--{b}\r\n"
            'Content-Disposition: form-data; name="slug"\r\n\r\n'
            "autumn-leaves\r\n"
            "--{b}--\r\n"
        ).format(b=boundary).encode("utf-8")
        fields = publish_mod.parse_multipart(
            "multipart/form-data; boundary={}".format(boundary), body
        )
        assert fields["slug"] == "autumn-leaves"
        assert "title" not in fields
        assert "composer" not in fields

    def test_parse_multipart_rejects_non_multipart(self):
        with pytest.raises(ValueError):
            publish_mod.parse_multipart("application/json", b"{}")


class TestPublishFlow:
    def test_publish_validates_slug_before_token(self, monkeypatch):
        monkeypatch.setenv("GITHUB_TOKEN", "tok")
        with pytest.raises(publish_mod.PublishError) as exc:
            publish_mod.publish("Bad Slug!", b"mp3", b"midi")
        assert exc.value.status_code == 422

    def test_publish_requires_token(self, monkeypatch):
        monkeypatch.delenv("GITHUB_TOKEN", raising=False)
        with pytest.raises(publish_mod.PublishError) as exc:
            publish_mod.publish("autumn-leaves", b"mp3", b"midi")
        assert exc.value.status_code == 503

    def test_publish_commits_mp3_and_midi(self, monkeypatch):
        monkeypatch.setenv("GITHUB_TOKEN", "tok")
        calls = []
        monkeypatch.setattr(
            publish_mod,
            "put_file",
            lambda path, content, message: calls.append(
                (path, content, message)
            ),
        )
        result = publish_mod.publish("autumn-leaves", b"MP3", b"MIDI")
        assert result == {"published": True, "slug": "autumn-leaves"}
        assert calls == [
            (
                "marketplace/autumn-leaves.mp3",
                b"MP3",
                "marketplace: publish autumn-leaves",
            ),
            (
                "marketplace/autumn-leaves.mid",
                b"MIDI",
                "marketplace: publish autumn-leaves",
            ),
        ]

    def test_publish_honors_env_repo_dir(self, monkeypatch):
        monkeypatch.setenv("GITHUB_TOKEN", "tok")
        monkeypatch.setenv("MARKETPLACE_GITHUB_DIR", "catalog")
        calls = []
        monkeypatch.setattr(
            publish_mod,
            "put_file",
            lambda path, content, message: calls.append(path),
        )
        publish_mod.publish("stella", b"MP3", b"MIDI")
        assert calls == ["catalog/stella.mp3", "catalog/stella.mid"]


class TestListings:
    def test_humanize_slug(self):
        assert listings_mod.humanize_slug("autumn-leaves") == "Autumn Leaves"
        assert listings_mod.humanize_slug("blue_in_green") == "Blue In Green"

    def test_listings_from_tree_groups_complete_pairs(self, monkeypatch):
        monkeypatch.setenv("MARKETPLACE_GITHUB_REPO", "kajica2/harmonic-study-engine")
        monkeypatch.setenv("MARKETPLACE_GITHUB_BRANCH", "main")
        monkeypatch.setenv("MARKETPLACE_GITHUB_DIR", "marketplace")
        tree = {
            "tree": [
                {"path": "marketplace/autumn-leaves.mp3"},
                {"path": "marketplace/autumn-leaves.mid"},
                {"path": "marketplace/stella.mp3"},  # missing .mid -> skipped
                {"path": "marketplace/blue-in-green.mid"},  # missing .mp3 -> skipped
                {"path": "marketplace/nested/deep.mp3"},  # subdir -> skipped
                {"path": "README.md"},
            ]
        }
        items = listings_mod.listings_from_tree(tree)
        assert [i["slug"] for i in items] == ["autumn-leaves"]
        assert items[0]["title"] == "Autumn Leaves"
        assert items[0]["mp3_url"].endswith("/marketplace/autumn-leaves.mp3")
        assert items[0]["midi_url"].endswith("/marketplace/autumn-leaves.mid")

    def test_listings_from_tree_sorts_by_slug(self, monkeypatch):
        monkeypatch.setenv("MARKETPLACE_GITHUB_DIR", "marketplace")
        tree = {
            "tree": [
                {"path": "marketplace/zeta.mp3"},
                {"path": "marketplace/zeta.mid"},
                {"path": "marketplace/alpha.mp3"},
                {"path": "marketplace/alpha.mid"},
            ]
        }
        items = listings_mod.listings_from_tree(tree)
        assert [i["slug"] for i in items] == ["alpha", "zeta"]

    def test_listings_from_tree_empty_tree(self, monkeypatch):
        monkeypatch.setenv("MARKETPLACE_GITHUB_DIR", "marketplace")
        assert listings_mod.listings_from_tree({"tree": []}) == []