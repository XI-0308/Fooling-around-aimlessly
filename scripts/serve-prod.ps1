# Build + PM2 prod mode
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "[RP-Agent] Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[RP-Agent] Starting PM2 (prod mode)..." -ForegroundColor Cyan
npx pm2 start ecosystem.prod.config.js --update-env
npx pm2 save | Out-Null

Write-Host "Prod mode started. Re-run after code changes." -ForegroundColor Green
