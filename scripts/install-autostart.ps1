# Register Windows scheduled task: restore WE-E (PM2) at user logon
$ErrorActionPreference = "Stop"
$TaskName = "RP-Agent-AutoStart"
$Root = Split-Path -Parent $PSScriptRoot
$ServeScript = Join-Path $Root "scripts\serve-autostart.ps1"

if (-not (Test-Path $ServeScript)) {
  Write-Error "Missing $ServeScript"
}

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ServeScript`"" `
  -WorkingDirectory $Root

$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings `
  -Description "Auto start WE-E (PM2 resurrect) at logon" -Force | Out-Null

Write-Host "Scheduled task '$TaskName' created (runs serve-autostart.ps1 at logon)." -ForegroundColor Green
Write-Host "Remove: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor Yellow
