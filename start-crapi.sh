#!/usr/bin/env bash
# Launch the defender protecting two OWASP crAPI stacks (prod + shadow).
#
# This is resource-heavy: it runs crAPI twice (each stack has several
# services plus Postgres/Mongo/Chroma), so give Docker plenty of RAM.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f crapi/upstream/docker-compose.yml ]; then
  echo "==> crAPI compose not found; fetching it"
  bash crapi/fetch.sh
fi

mkdir -p logs patches crapi/fork
: > logs/shadow.log

echo "==> Creating shared network defender-net (if absent)"
docker network inspect defender-net >/dev/null 2>&1 || docker network create defender-net

echo "==> Starting crAPI PRODUCTION stack"
docker compose -p crapi-prod \
  -f crapi/upstream/docker-compose.yml -f crapi/override.prod.yml up -d

echo "==> Starting crAPI SHADOW (decoy) stack"
docker compose -p crapi-shadow \
  -f crapi/upstream/docker-compose.yml -f crapi/override.shadow.yml up -d

echo "==> Starting defender (gateway, orchestrator, dashboard, redis)"
docker compose -f docker-compose.defender.yml up --build -d

echo
echo "Gateway (send traffic here): http://localhost:8080"
echo "Dashboard:                   http://localhost:3000"
echo
echo "crAPI stacks take a minute or two to become healthy. Watch with:"
echo "    docker compose -p crapi-prod -f crapi/upstream/docker-compose.yml ps"
