#!/usr/bin/env bash
# Fetch OWASP crAPI's official docker-compose into crapi/upstream/.
# We do NOT vendor crAPI's files in this repo; they are pulled at setup
# time from the upstream project so you always run their current release.
#
# crAPI is OWASP's deliberately-vulnerable training API (Apache-2.0). If you
# redistribute it, keep its upstream LICENSE/notice.
set -euo pipefail
cd "$(dirname "$0")"

CRAPI_REF="${CRAPI_REF:-develop}"
BASE="https://raw.githubusercontent.com/OWASP/crAPI/${CRAPI_REF}/deploy/docker"

mkdir -p upstream
echo "==> Fetching crAPI docker-compose (${CRAPI_REF})"
curl -fsSL "${BASE}/docker-compose.yml" -o upstream/docker-compose.yml

# crAPI's compose may reference an .env; fetch it if present (ignore if not).
curl -fsSL "${BASE}/.env" -o upstream/.env 2>/dev/null || true

echo "==> Saved to crapi/upstream/docker-compose.yml"
echo
echo "Optional: to let the fixer agent propose patches, clone crAPI source"
echo "into crapi/fork so the agents can read it:"
echo "    git clone --depth 1 https://github.com/OWASP/crAPI.git crapi/fork-src"
echo "    # then point FORK_DIR at the service source you want patched"
