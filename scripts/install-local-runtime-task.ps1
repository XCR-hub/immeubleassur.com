param(
  [string]$TaskName = 'ImmeubleAssur Runtime Reports',
  [string]$SiteRoot = 'F:\immeubleassur-sync\immeubleassur.com',
  [string]$WrapperPath = '',
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
if (-not $WrapperPath) { $WrapperPath = Join-Path $SiteRoot 'scripts\local-runtime-task.ps1' }
if (-not (Test-Path -LiteralPath $WrapperPath)) { throw "Wrapper runtime introuvable: $WrapperPath" }

$quotedWrapper = '"' + $WrapperPath + '"'
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' + $quotedWrapper)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 72)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
$task = Get-ScheduledTask -TaskName $TaskName
Write-Output ("task={0} state={1} principal={2} interval=15m wrapper={3}" -f $task.TaskName, $task.State, $task.Principal.UserId, $WrapperPath)
if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Output ("started={0}" -f $TaskName)
}