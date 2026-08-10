param(
  [string]$TaskName = 'ImmeubleAssur SQLite Backup',
  [string]$SiteRoot = 'F:\immeubleassur-sync\immeubleassur.com',
  [int]$OffsetMinute = 8,
  [switch]$RunNow
)
$ErrorActionPreference = 'Stop'
$wrapper = Join-Path $SiteRoot 'scripts\local-sqlite-backup-task.ps1'
if (-not (Test-Path -LiteralPath $wrapper)) { throw "Wrapper sauvegarde introuvable: $wrapper" }
$now = Get-Date
$first = Get-Date -Hour $now.Hour -Minute $OffsetMinute -Second 0
if ($first -le $now) { $first = $first.AddHours(1) }
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $wrapper + '"')
$trigger = New-ScheduledTaskTrigger -Once -At $first -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
$task = Get-ScheduledTask -TaskName $TaskName
if ($task.Principal.LogonType -ne 'ServiceAccount' -or $task.Principal.RunLevel -ne 'Highest') { throw 'Principal sauvegarde invalide.' }
Write-Output ("task={0} first={1:o} interval=6h offset={2}" -f $TaskName, $first, $OffsetMinute)
if ($RunNow) { Start-ScheduledTask -TaskName $TaskName }
