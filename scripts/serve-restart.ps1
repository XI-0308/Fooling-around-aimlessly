# Restart RP-Agent PM2 processes (start if missing)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "[RP-Agent] 正在重启..." -ForegroundColor Cyan
$restartOut = npx pm2 restart rp-agent-server rp-agent-web cookiecloud --update-env 2>&1 | Out-String

if ($restartOut -match "not found" -or $restartOut -match "doesn't exist") {
  Write-Host "[RP-Agent] 未检测到 PM2 进程，正在首次启动（dev 模式）..." -ForegroundColor Yellow
  npx pm2 start ecosystem.config.js --update-env
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$ccStatus = npx pm2 describe cookiecloud 2>&1 | Out-String
if ($ccStatus -match "not found" -or $ccStatus -match "doesn't exist") {
  Write-Host "[CookieCloud] 正在首次启动 cookiecloud..." -ForegroundColor Yellow
  npx pm2 start ecosystem.config.js --only cookiecloud --update-env
}

Write-Host ""
npx pm2 status
Write-Host ""
Write-Host "完成。浏览器打开 http://localhost:3000" -ForegroundColor Green
Write-Host "若页面仍异常，清缓存后重试：" -ForegroundColor DarkGray
Write-Host "  Remove-Item -Recurse -Force apps\web\.next" -ForegroundColor DarkGray
Write-Host "  npm run serve:restart" -ForegroundColor DarkGray
