# CookieCloud setup: install deps, start PM2, write Encore Flow settings (Node patch)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ApiDir = Join-Path $Root "services\cookiecloud-api"

Write-Host "[CookieCloud] Checking API dependencies..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $ApiDir "node_modules"))) {
  Push-Location $ApiDir
  npm install
  Pop-Location
}

Write-Host "[CookieCloud] Starting PM2 on port 8088..." -ForegroundColor Cyan
$desc = npx pm2 describe cookiecloud 2>&1 | Out-String
if ($desc -match "not found" -or $desc -match "doesn't exist") {
  npx pm2 start ecosystem.config.js --only cookiecloud --update-env
} else {
  npx pm2 restart cookiecloud --update-env
}

Start-Sleep -Seconds 2
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8088/health" -TimeoutSec 5
  Write-Host "[CookieCloud] Service OK: $($health.status)" -ForegroundColor Green
} catch {
  Write-Host "[CookieCloud] WARN: /health not ready yet. Check http://127.0.0.1:8088/health" -ForegroundColor Yellow
}

node (Join-Path $Root "scripts\cookiecloud-setup.mjs")

Write-Host ""
Write-Host "Next steps (Edge / Chrome on PC):" -ForegroundColor Cyan
Write-Host "  1. Install CookieCloud extension from Edge Add-ons store"
Write-Host "  2. Paste URL / UUID / Password into extension settings"
Write-Host "  3. Crypto mode: Fixed IV (aes-128-cbc-fixed)"
Write-Host "  4. Log in to music.163.com and weread.qq.com"
Write-Host "  5. Click Sync in the extension"
Write-Host "  6. Encore Flow Settings -> CookieCloud -> Test connection"
Write-Host ""
npx pm2 save | Out-Null
