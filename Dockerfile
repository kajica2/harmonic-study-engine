# =====================================================================
# Hugging Face Spaces entry point.
#
# Single-container deploy: the Vite-built frontend is served as
# static files by the FastAPI app, and the API endpoints are served
# on the same origin. This avoids CORS entirely and makes the
# deployment a single URL on HF Spaces.
#
# Multi-stage:
#   1. node:20-alpine builds the frontend (dist/)
#   2. python:3.10-slim installs the FastAPI backend (same shape as
#      server/Dockerfile for Render)
#   3. Runtime image copies dist/ into the backend image and serves
#      everything from uvicorn.
#
# HF Spaces allocates port 7860 by default. We map 7860 -> 8765
# inside the container and set PORT=7860 so uvicorn binds there.
# CORS is permissive inside the container since everything is
# served from the same origin.
# =====================================================================

# ---------- Stage 1: build the Vite frontend ----------
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Install only what we need for vite build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build with the backend URL pointing at the same-origin API
ARG VITE_DDSP_API=
ENV VITE_DDSP_API=$VITE_DDSP_API
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# public/ is optional; skip if absent
RUN npm run build

# ---------- Stage 2: install the FastAPI backend deps ----------
# DDSP is intentionally NOT installed in the HF image. The official
# `ddsp` v3.7.0 git tag was removed from upstream and the package is
# too heavy (~1.5 GB with TF) for the HF Spaces free tier. The
# `/synthesize` endpoint is wired as a stub that returns 503 with a
# clear error. The rest of the app (backing tracks, recording,
# scale playback, mobile bar) works without DDSP.
# If you need DDSP on HF, you'll need a paid CPU tier and a forked
# `ddsp` repo — see server/app.py for the integration points.
FROM python:3.10-slim AS backend-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY server/requirements.txt /app/server/requirements.txt
# Trim ddsp/tensorflow from the install on HF — they don't fit
# the free tier and the upstream tag is gone. We use a sed
# one-liner instead of a separate requirements file so the
# local Render install keeps the heavy deps.
RUN sed -e '/^ddsp /d' -e '/^tensorflow/d' -e '/^numpy>=/d' /app/server/requirements.txt > /tmp/req-hf.txt && \
    uv venv --python 3.10 /app/server/.venv && \
    . /app/server/.venv/bin/activate && \
    uv pip install --no-cache-dir "setuptools<81" wheel && \
    uv pip install --no-cache-dir --no-build-isolation -r /tmp/req-hf.txt

# ---------- Stage 3: runtime ----------
FROM python:3.10-slim AS runtime

# Install ffmpeg in the runtime image too (used by /recordings/upload
# to transcode WebM -> MP4). Also libsndfile for librosa.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=7860 \
    DDSP_HOST=0.0.0.0

# Copy the built venv
COPY --from=backend-builder /app/server/.venv /app/server/.venv
ENV PATH=/app/server/.venv/bin:$PATH \
    VIRTUAL_ENV=/app/server/.venv

# Copy the FastAPI app
COPY server/ /app/server/
# The static dir is created by the next COPY; create the empty
# dir here so the StaticFiles mount in app.py doesn't fail.
RUN mkdir -p /app/server/static

# Copy the built Vite frontend into the static-serve directory.
# The FastAPI app mounts StaticFiles on / so the same URL serves
# both the SPA and the API.
COPY --from=frontend-builder /build/dist /app/server/static

# Run from the repo root (/app) so `server.app:app` is importable.
# (Render uses cd /app/server; the HF Dockerfile keeps it simpler.)
WORKDIR /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request, sys; \
sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:7860/health', timeout=5).status == 200 else sys.exit(1)"

EXPOSE 7860

CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--proxy-headers"]