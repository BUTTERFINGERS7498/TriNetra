# Launch the defender protecting two OWASP crAPI stacks (prod + shadow).
# Resource-heavy: crAPI runs twice. Give Docker Desktop plenty of RAM.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path crapi/upstream/docker-compose.yml)) {
  Write-Host "==> crAPI compose not found; fetching it"
  & powershell -ExecutionPolicy Bypass -File crapi/fetch.ps1
}

New-Item -ItemType Directory -Force -Path logs, patches, crapi/fork | Out-Null
Set-Content -Path logs/shadow.log -Value "" -NoNewline

Write-Host "==> Creating shared network defender-net (if absent)"
docker network inspect defender-net 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { docker network create defender-net }

Write-Host "==> Starting crAPI PRODUCTION stack"
docker compose -p crapi-prod -f crapi/upstream/docker-compose.yml -f crapi/override.prod.yml up -d

Write-Host "==> Starting crAPI SHADOW (decoy) stack"
docker compose -p crapi-shadow -f crapi/upstream/docker-compose.yml -f crapi/override.shadow.yml up -d

Write-Host "==> Starting defender (gateway, orchestrator, dashboard, redis)"
docker compose -f docker-compose.defender.yml up --build -d

Write-Host ""
Write-Host "Gateway (send traffic here): http://localhost:8080"
Write-Host "Dashboard:                   http://localhost:3000"
