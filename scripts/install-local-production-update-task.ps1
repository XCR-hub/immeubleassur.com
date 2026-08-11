param(
  [string]$TaskName = 'ImmeubleAssur Production Update',
  [string]$SiteRoot = 'F:\immeubleassur-sync\immeubleassur.com',
  [string]$ReportPath = 'F:\immeubleassur-runtime\reports\production-checkout-update-report.json',
  [string]$NodePath = 'C:\Program Files\nodejs\node.exe',
  [string]$RuntimeRoot = 'F:\immeubleassur-runtime',
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$siteRootResolved = (Resolve-Path -LiteralPath $SiteRoot).Path
$wrapperPath = Join-Path $siteRootResolved 'scripts\update-local-production-checkout.ps1'
if (-not (Test-Path -LiteralPath $wrapperPath)) { throw "Script de mise a jour introuvable: $wrapperPath" }
if (-not (Test-Path -LiteralPath $NodePath)) { throw "Node.js introuvable: $NodePath" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null

function Quote-TaskArgument([string]$Value) { '"' + $Value.Replace('"', '\"') + '"' }

$arguments = @(
  '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-File', (Quote-TaskArgument $wrapperPath),
  '-SiteRoot', (Quote-TaskArgument $siteRootResolved),
  '-ReportPath', (Quote-TaskArgument $ReportPath),
  '-NodePath', (Quote-TaskArgument $NodePath),
  '-RuntimeRoot', (Quote-TaskArgument $RuntimeRoot)
) -join ' '
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument $arguments -WorkingDirectory $siteRootResolved
$now = Get-Date
$hourStart = Get-Date -Hour $now.Hour -Minute 0 -Second 0
$first = $hourStart.AddMinutes(([math]::Floor($now.Minute / 10) * 10) + 3)
if ($first -le $now) { $first = $first.AddMinutes(10) }
$trigger = New-ScheduledTaskTrigger -Once -At $first -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 25)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$sid = ([System.Security.Principal.NTAccount]$task.Principal.UserId).Translate([System.Security.Principal.SecurityIdentifier]).Value
$hasTenMinutes = @($task.Triggers | Where-Object { $_.Repetition.Interval -eq 'PT10M' }).Count -gt 0
$startMinute = ([DateTime]$task.Triggers[0].StartBoundary).Minute
if ($sid -ne 'S-1-5-18' -or $task.Principal.LogonType -ne 'ServiceAccount') { throw "Principal invalide: $sid/$($task.Principal.LogonType)" }
if ($task.Actions.Execute -notlike '*PowerShell.exe' -or $task.Actions.Arguments -notlike '*update-local-production-checkout.ps1*') { throw 'Action de mise a jour invalide.' }
if (-not $hasTenMinutes -or ($startMinute % 10) -ne 3) { throw "Planification invalide: interval10m=$hasTenMinutes minute=$startMinute" }
Write-Output ("task={0} state={1} principal={2} interval10m={3} offset={4}" -f $task.TaskName, $task.State, $task.Principal.UserId, $hasTenMinutes, ($startMinute % 10))
if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Output ("started={0}" -f $TaskName)
}
