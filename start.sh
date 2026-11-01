#!/usr/bin/env bash
# start.sh — Launch both the FastAPI backend and Next.js frontend on macOS / Linux
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [ ! -x "${PYTHON_BIN}" ]; then
  PYTHON_BIN="python3"
fi

echo "[FLYSWARM] Starting FastAPI backend on http://localhost:8000 ..."
(cd "${ROOT_DIR}" && "${PYTHON_BIN}" -m uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload) &
BACKEND_PID=$!

cleanup() {
  echo ""
  echo "[FLYSWARM] Shutting down services..."
  kill "${BACKEND_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1.5
echo "[FLYSWARM] Starting Next.js frontend on http://localhost:3000 ..."
cd "${ROOT_DIR}/frontend"
npm run dev
