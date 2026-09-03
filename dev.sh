#!/bin/bash
# Harmonic Study Engine — one-command launcher.
#
# Starts the FastAPI backend (:8765) + Vite frontend (:3000), waits
# for both to be healthy, then opens the browser. Ctrl+C stops both.
#
# No Docker, no DDSP install required:
#   - Creates .venv on first run and installs only the lean
#     server/requirements.txt (fastapi/uvicorn/pydantic/python-multipart).
#   - The backend boots in degraded mode (/health -> "degraded") when
#     DDSP isn't installed; the rest of the app works fine. Install
#     server/requirements-ddsp.txt on top of the venv if you want
#     the optional offline DDSP render + FFT reverb path.

set -u

BACKEND_PORT=8765
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
VENV_DIR="${VENV_DIR:-.venv}"
REQUIREMENTS_FILE="server/requirements.txt"
VITE_FLAGS=(--port="$FRONTEND_PORT" --host=0.0.0.0 --strictPort)

# ---------- helpers ---------------------------------------------------------
kill_port() {
  local pids
  pids=$(lsof -ti tcp:"$1" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  port $1 busy — stopping stale process(es): $(echo "$pids" | tr '\n' ' ')"
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
  fi
}

wait_for() {
  local url=$1 name=$2 tries=$3
  for _ in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null "$url"; then
      echo "  ✓ $name is up"
      return 0
    fi
    sleep 0.5
  done
  echo "  ✗ $name failed to start"
  return 1
}

cleanup() {
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# ---------- preflight ------------------------------------------------------
if ! command -v python3 >/dev/null; then
  echo "✗ python3 not found on PATH. Install Python 3.9+ first."
  exit 1
fi

if ! command -v node >/dev/null; then
  echo "✗ node not found on PATH. Install Node 18+ first."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[0/3] Installing frontend deps (npm install)..."
  npm install --no-audit --no-fund
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "[0/3] Creating venv at $VENV_DIR and installing core backend deps..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
  "$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_FILE"
fi

# ---------- 1. Backend ------------------------------------------------------
echo "[1/3] Backend on :$BACKEND_PORT"
kill_port "$BACKEND_PORT"
"$VENV_DIR/bin/python" -m server.app >/tmp/hse-backend.log 2>&1 &
BACKEND_PID=$!
wait_for "http://127.0.0.1:$BACKEND_PORT/health" "backend" 60 || {
  echo "  backend log tail:"
  tail -n 20 /tmp/hse-backend.log | sed 's/^/    /'
  exit 1
}

# ---------- 2. Vite frontend -----------------------------------------------
echo "[2/3] Vite frontend on :$FRONTEND_PORT"
kill_port "$FRONTEND_PORT"
npx vite "${VITE_FLAGS[@]}" >/tmp/hse-frontend.log 2>&1 &
FRONTEND_PID=$!
wait_for "http://127.0.0.1:$FRONTEND_PORT" "vite" 60 || {
  echo "  frontend log tail:"
  tail -n 20 /tmp/hse-frontend.log | sed 's/^/    /'
  exit 1
}

# ---------- 3. Browser -----------------------------------------------------
echo "[3/3] Opening browser"
open "http://localhost:$FRONTEND_PORT"

echo
echo "Harmonic Study Engine is running"
echo "  frontend : http://localhost:$FRONTEND_PORT"
echo "  api      : http://127.0.0.1:$BACKEND_PORT  (GET /health, POST /synthesize)"
echo "  logs     : /tmp/hse-backend.log, /tmp/hse-frontend.log"
echo "Ctrl+C to stop both servers."
wait