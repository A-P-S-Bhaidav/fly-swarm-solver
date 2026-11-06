#!/usr/bin/env bash
# tunnel.sh — Run the FlySwarm backend on THIS machine and expose it publicly
# over HTTPS/WSS through a free Cloudflare Quick Tunnel (no account, no card).
#
# Usage:
#   ./scripts/tunnel.sh                       # prints the public URL
#   VERCEL_URL=https://my-app.vercel.app ./scripts/tunnel.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
[ -x "${PYTHON_BIN}" ] || PYTHON_BIN="python3"
VERCEL_URL="${VERCEL_URL:-https://YOUR-VERCEL-APP.vercel.app}"
TUNNEL_LOG="$(mktemp -t flyswarm-tunnel.XXXXXX)"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[FLYSWARM] cloudflared not found."
  echo "  macOS:   brew install cloudflared"
  echo "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo "  Windows: winget install --id Cloudflare.cloudflared"
  exit 1
fi

cleanup() {
  echo ""
  echo "[FLYSWARM] Stopping backend and tunnel..."
  [ -n "${BACKEND_PID:-}" ] && kill "${BACKEND_PID}" 2>/dev/null || true
  [ -n "${TUNNEL_PID:-}" ] && kill "${TUNNEL_PID}" 2>/dev/null || true
  rm -f "${TUNNEL_LOG}"
}
trap cleanup EXIT INT TERM

echo "[FLYSWARM] Starting backend on http://127.0.0.1:8000 ..."
(cd "${ROOT_DIR}" && "${PYTHON_BIN}" -m uvicorn server.app:app --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!

for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 && break
  sleep 1
done

echo "[FLYSWARM] Opening Cloudflare Quick Tunnel ..."
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000 >"${TUNNEL_LOG}" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "${TUNNEL_LOG}" | head -n1 || true)"
  [ -n "${PUBLIC_URL}" ] && break
  sleep 1
done

if [ -z "${PUBLIC_URL}" ]; then
  echo "[FLYSWARM] Tunnel did not report a URL. Log:"
  cat "${TUNNEL_LOG}"
  exit 1
fi

echo ""
echo "=================================================================="
echo " Backend public URL : ${PUBLIC_URL}"
echo " Health check       : ${PUBLIC_URL}/health"
echo ""
echo " Open your site with:"
echo "   ${VERCEL_URL}/?backend=${PUBLIC_URL}"
echo ""
echo " Keep this terminal open. Press Ctrl+C to stop."
echo "=================================================================="

wait "${BACKEND_PID}"
