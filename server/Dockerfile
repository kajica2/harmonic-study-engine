# Render Dockerfile for the DDSP FastAPI backend.
# Python 3.10 base — DDSP 3.7.0 + TF 2.21 are pinned to that version.
# We rebuild the venv at image-build time (uv is used because it's faster
# than pip and caches well between builds; install cmd matches the local
# `ddsp-install-macos-arm64` skill so the same install shape is used).

FROM python:3.10-slim AS base

# System deps for TF / librosa / llvmlite
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Stage 1: install uv (fast venv mgmt) ----------
FROM base AS uv-base
RUN pip install --no-cache-dir uv

# ---------- Stage 2: build Python deps in a clean venv ----------
FROM uv-base AS builder

COPY server/requirements.txt /app/server/requirements.txt

# Recreate the same install shape we use locally. setuptools<81 because
# crepe's build still uses pkg_resources. --no-build-isolation so crepe's
# build sees our downgraded setuptools.
RUN cd /app/server && \
    uv venv --python 3.10 /app/server/.venv && \
    . /app/server/.venv/bin/activate && \
    uv pip install --no-cache-dir "setuptools<81" wheel && \
    uv pip install --no-cache-dir --no-build-isolation -r requirements.txt

# ---------- Stage 3: runtime image ----------
FROM base AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8765 \
    DDSP_HOST=0.0.0.0

# Copy built venv
COPY --from=builder /app/server/.venv /app/server/.venv
ENV PATH=/app/server/.venv/bin:$PATH \
    VIRTUAL_ENV=/app/server/.venv

# Copy application
COPY server/ /app/server/
WORKDIR /app/server

# Health-check via the existing /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request, sys; \
sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=5).status == 200 else sys.exit(1)"

EXPOSE 8765

# Use the production-ready ASGI server (uvicorn handles multiple workers,
# but Render free tier = 1 worker is fine). --proxy-headers makes the
# signed protocol / IP usable from inside the ASGI app if needed.
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1", "--proxy-headers"]
