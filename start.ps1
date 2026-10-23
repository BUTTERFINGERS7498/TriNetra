# Reset the fork from the pristine app, rebuild the stack, and launch it.
# Windows PowerShell convenience wrapper for start.sh.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> Resetting fork and deployed copies from the pristine app"
New-Item -ItemType Directory -Force -Path fork, deployed, logs, patches | Out-Null
Copy-Item demo_app/app.py fork/app.py -Force
Copy-Item demo_app/app.py deployed/app.py -Force
Set-Content -Path logs/prod.log -Value "" -NoNewline
Set-Content -Path logs/shadow.log -Value "" -NoNewline

if (-not $env:ANTHROPIC_API_KEY -and -not (Test-Path .env)) {
  Write-Host "!! ANTHROPIC_API_KEY is not set and no .env file found." -ForegroundColor Yellow
  Write-Host "   Create a .env file with: ANTHROPIC_API_KEY=sk-ant-..."
}

Write-Host "==> Building and starting containers"
docker compose up --build -d

Write-Host ""
Write-Host "Gateway (send traffic here): http://localhost:8080"
Write-Host "Dashboard:                   http://localhost:3000"
