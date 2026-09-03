#!/bin/bash
# Wrapper around `python -m pytest server/tests/` that prefers the
# project venv if it exists. npm scripts can't do conditional python
# selection, so this lives in scripts/.
set -u
cd "$(dirname "$0")/.."
if [ -x .venv/bin/python ]; then
  PYTHON=.venv/bin/python
else
  PYTHON=python3
fi
exec "$PYTHON" -m pytest server/tests/ "$@"