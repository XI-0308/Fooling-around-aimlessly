# Build + restart (prod mode, or dev after manual build)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "[RP-Agent] 正在构建..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[RP-Agent] 构建完成，正在重启 PM2..." -ForegroundColor Cyan
& "$PSScriptRoot\serve-restart.ps1"
