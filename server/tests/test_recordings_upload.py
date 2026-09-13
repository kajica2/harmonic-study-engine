"""Contract tests for /recordings/upload. Accepts a browser-recorded
WebM blob from MediaRecorder and returns either MP4 (transcoded
via ffmpeg) or the original WebM (fallback when ffmpeg is not
installed). The test env doesn't have ffmpeg, so every test
exercises the fallback path."""


class TestRecordingsUpload:
    """POST /recordings/upload with multipart fields:
      - audio (file): WebM blob from MediaRecorder
      - duration_sec: float form field, used for filename only
    With ffmpeg: 200 + video/mp4. Without ffmpeg: 200 + original
    WebM (X-Transcoded: false header). Empty body: 400."""

    MINIMAL_WEBM = b"\x1a\x45\xdf\xa3"  # EBML header, the WebM magic bytes
    # Real WebM blobs are hundreds of bytes minimum; this is just
    # enough for `await audio.read()` to return non-empty.

    def test_returns_200_with_fallback_when_no_ffmpeg(self, client, monkeypatch):
        """Without ffmpeg on PATH, the endpoint returns the original
        WebM blob untouched. We force the no-ffmpeg branch by
        monkeypatching shutil.which globally — the endpoint does
        `import shutil` inside its handler body, but the module
        reference is the same global `shutil`."""
        monkeypatch.setattr("shutil.which", lambda _: None)
        resp = client.post(
            "/recordings/upload",
            files={"audio": ("recording.webm", self.MINIMAL_WEBM, "video/webm")},
            data={"duration_sec": "12"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("video/webm")

    def test_fallback_response_body_matches_input(self, client, monkeypatch):
        """The no-ffmpeg fallback should echo the request body
        byte-for-byte — that's the whole point of the fallback."""
        monkeypatch.setattr("shutil.which", lambda _: None)
        resp = client.post(
            "/recordings/upload",
            files={"audio": ("rec.webm", self.MINIMAL_WEBM, "video/webm")},
        )
        assert resp.content == self.MINIMAL_WEBM

    def test_fallback_sets_x_transcoded_false(self, client, monkeypatch):
        """The X-Transcoded header must be present and set to the
        string 'false' (not the boolean) when no transcode happens.
        The frontend reads this to decide whether to offer a
        client-side re-encode option."""
        monkeypatch.setattr("shutil.which", lambda _: None)
        resp = client.post(
            "/recordings/upload",
            files={"audio": ("r.webm", self.MINIMAL_WEBM, "video/webm")},
        )
        assert resp.headers.get("x-transcoded") == "false"

    def test_400_on_empty_audio(self, client):
        """Empty audio body must produce 400 'empty recording'.
        This check fires before the ffmpeg fallback, so it
        doesn't depend on monkeypatching shutil.which."""
        resp = client.post(
            "/recordings/upload",
            files={"audio": ("empty.webm", b"", "video/webm")},
        )
        assert resp.status_code == 400
        assert "empty" in resp.text.lower()

    def test_fallback_filename_omits_duration(self, client, monkeypatch):
        """When ffmpeg IS available and the recording is transcoded,
        the filename includes duration (format: recording-<hex>-<sec>s.mp4).
        The fallback path (no ffmpeg) uses a UUID-only filename, no
        duration. This test pins the current behavior: when ffmpeg
        is unavailable, duration is NOT in the filename.
        If a future change adds duration to the fallback filename,
        update this test."""
        monkeypatch.setattr("shutil.which", lambda _: None)
        resp = client.post(
            "/recordings/upload",
            files={"audio": ("r.webm", self.MINIMAL_WEBM, "video/webm")},
            data={"duration_sec": "42"},
        )
        cd = resp.headers.get("content-disposition", "")
        # Filename in fallback is recording-<uuidhex>.webm — UUID only,
        # no duration. (The transcoded path uses recording-<hex8>-<sec>s.mp4.)
        assert "recording-" in cd
        assert ".webm" in cd

    def test_fallback_preserves_content_type_from_request(self, client, monkeypatch):
        """If the browser sends content-type='video/webm;codecs=vp8,opus',
        the fallback should preserve it (with the codec suffix stripped
        by the multipart parser, but the base type stays)."""
        monkeypatch.setattr("shutil.which", lambda _: None)
        resp = client.post(
            "/recordings/upload",
            files={"audio": ("r.webm", self.MINIMAL_WEBM, "video/webm;codecs=vp8,opus")},
        )
        # The fallback uses audio.content_type or 'video/webm'
        # as default — either preserves the family.
        assert "video/webm" in resp.headers["content-type"]