# PM2 watchdog - dev mode (auto restart on crash)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "[RP-Agent] Starting PM2 watchdog (dev mode)..." -ForegroundColor Cyan
npx pm2 start ecosystem.config.js --update-env
npx pm2 save | Out-Null

Write-Host ""
Write-Host "Started. Open http://localhost:3000 or Tailscale IP :3000" -ForegroundColor Green
Write-Host "Commands:" -ForegroundColor Yellow
Write-Host "  npm run serve:status"
Write-Host "  npm run serve:logs"
Write-Host "  npm run serve:restart"
Write-Host "  npm run serve:stop"
