# Fetch OWASP crAPI's official docker-compose into crapi/upstream/.
# We do NOT vendor crAPI's files; they are pulled from upstream at setup.
# crAPI is OWASP's deliberately-vulnerable training API (Apache-2.0).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$ref  = if ($env:CRAPI_REF) { $env:CRAPI_REF } else { "develop" }
$base = "https://raw.githubusercontent.com/OWASP/crAPI/$ref/deploy/docker"

New-Item -ItemType Directory -Force -Path upstream | Out-Null
Write-Host "==> Fetching crAPI docker-compose ($ref)"
Invoke-WebRequest "$base/docker-compose.yml" -OutFile upstream/docker-compose.yml
try { Invoke-WebRequest "$base/.env" -OutFile upstream/.env } catch {}

Write-Host "==> Saved to crapi/upstream/docker-compose.yml"
