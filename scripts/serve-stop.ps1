$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
npx pm2 stop rp-agent-server rp-agent-web 2>$null
npx pm2 delete rp-agent-server rp-agent-web 2>$null
Write-Host "RP-Agent PM2 stopped." -ForegroundColor Yellow
