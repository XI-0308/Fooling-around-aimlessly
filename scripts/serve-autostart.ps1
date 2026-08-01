# Logon autostart: restore PM2 apps from last `pm2 save` (prod dump)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Ensure PATH has node/npm for scheduled-task sessions
$nodeDir = "C:\Program Files\nodejs"
if (Test-Path $nodeDir) {
  $env:Path = "$nodeDir;$env:APPDATA\npm;$env:Path"
}

Write-Host "[WE-E] Autostart: pm2 resurrect..." -ForegroundColor Cyan
npx pm2 resurrect

$list = npx pm2 jlist 2>$null
if (-not $list -or $list -eq "[]") {
  Write-Host "[WE-E] Dump empty, starting prod ecosystem..." -ForegroundColor Yellow
  npx pm2 start ecosystem.prod.config.js --update-env
  npx pm2 save | Out-Null
}

Write-Host "[WE-E] Autostart done." -ForegroundColor Green
