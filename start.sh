#!/usr/bin/env bash
# Reset the fork from the pristine app, rebuild the stack, and launch it.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Resetting fork and deployed copies from the pristine app"
mkdir -p fork deployed logs patches
cp demo_app/app.py fork/app.py
cp demo_app/app.py deployed/app.py

# Fresh logs each run so the detector starts from a clean slate.
: > logs/prod.log
: > logs/shadow.log

if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ ! -f .env ]; then
  echo "!! ANTHROPIC_API_KEY is not set and no .env file found."
  echo "   The agents will not run without it. Create a .env with:"
  echo "     ANTHROPIC_API_KEY=sk-ant-..."
fi

echo "==> Building and starting containers"
docker compose up --build -d

echo
echo "Gateway (send traffic here): http://localhost:8080"
echo "Dashboard:                   http://localhost:3000"
echo
echo "Tail logs with: docker compose logs -f orchestrator"
