#!/usr/bin/env bash
# codespace_start.sh — Start the FlySwarm backend inside GitHub Codespaces,
# make port 8000 public, and print the URL to use with the Vercel frontend.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="/tmp/flyswarm-backend.log"
cd "${ROOT_DIR}"

if ! pgrep -f "uvicorn server.app:app" >/dev/null 2>&1; then
  nohup python -m uvicorn server.app:app --host 0.0.0.0 --port 8000 >"${LOG_FILE}" 2>&1 &
  echo "[FLYSWARM] Backend starting (logs: ${LOG_FILE})"
fi

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [ -n "${CODESPACE_NAME:-}" ]; then
  gh codespace ports visibility 8000:public -c "${CODESPACE_NAME}" >/dev/null 2>&1 || \
    echo "[FLYSWARM] Could not set port visibility automatically. Open the PORTS tab, right-click 8000 -> Port Visibility -> Public."
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  PUBLIC_URL="https://${CODESPACE_NAME}-8000.${DOMAIN}"
  echo ""
  echo "=================================================================="
  echo " FlySwarm backend public URL:"
  echo "   ${PUBLIC_URL}"
  echo ""
  echo " Open your Vercel site with:"
  echo "   https://YOUR-VERCEL-APP.vercel.app/?backend=${PUBLIC_URL}"
  echo "=================================================================="
fi
