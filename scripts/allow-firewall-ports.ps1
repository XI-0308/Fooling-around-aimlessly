# 需「管理员」PowerShell 运行：放行 Tailscale/局域网访问 3000、3001
$ErrorActionPreference = "Stop"
foreach ($port in @(3000, 3001)) {
  $name = "RP-Agent TCP $port"
  $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $name -Enabled True -Action Allow | Out-Null
    Write-Host "已更新规则: $name"
  } else {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any | Out-Null
    Write-Host "已创建规则: $name"
  }
}
Write-Host "完成。手机再试 http://100.127.1.64:3000"
