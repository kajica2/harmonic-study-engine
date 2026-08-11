#!/bin/bash
# Harmonic Study Engine — one-command launcher.
# Starts the DDSP Python backend (:8765) + Vite frontend (:3000),
# waits for both to be healthy, then opens the browser.
# Ctrl+C stops everything.

BACKEND_PORT=8765
FRONTEND_PORT=3000
VENV=".venv"

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
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# ---------- preflight -------------------------------------------------------
if [ ! -x "$VENV/bin/python" ]; then
  echo "✗ $VENV not found. Run the DDSP install first (skill: ddsp-install-macos-arm64)."
  exit 1
fi

# ---------- 1. DDSP backend -------------------------------------------------
echo "[1/3] DDSP backend on :$BACKEND_PORT"
kill_port "$BACKEND_PORT"
"$VENV/bin/python" -m server.app &
BACKEND_PID=$!
wait_for "http://127.0.0.1:$BACKEND_PORT/health" "DDSP backend" 120 || exit 1

# ---------- 2. Vite frontend ------------------------------------------------
echo "[2/3] Vite frontend on :$FRONTEND_PORT"
kill_port "$FRONTEND_PORT"
npx vite --port="$FRONTEND_PORT" --host=0.0.0.0 --strictPort &
FRONTEND_PID=$!
wait_for "http://127.0.0.1:$FRONTEND_PORT" "Vite frontend" 60 || exit 1

# ---------- 3. Browser ------------------------------------------------------
echo "[3/3] Opening browser"
open "http://localhost:$FRONTEND_PORT"

echo
echo "Harmonic Study Engine is running"
echo "  frontend : http://localhost:$FRONTEND_PORT"
echo "  ddsp api : http://127.0.0.1:$BACKEND_PORT  (GET /health, POST /synthesize)"
echo "Ctrl+C to stop both servers."
wait
