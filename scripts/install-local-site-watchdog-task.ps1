param(
  [string]$TaskName = 'ImmeubleAssur Local Site',
  [string]$SiteRoot = 'F:\immeubleassur-sync\immeubleassur.com',
  [string]$NodePath = 'C:\Program Files\nodejs\node.exe',
  [string]$LogRoot = 'F:\immeubleassur-runtime\logs',
  [string]$ReportPath = 'F:\immeubleassur-runtime\reports\local-site-watchdog-report.json',
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$siteRootResolved = (Resolve-Path -LiteralPath $SiteRoot).Path
$watchdogPath = Join-Path $siteRootResolved 'scripts\local-site-watchdog.js'
if (-not (Test-Path -LiteralPath $watchdogPath)) { throw "Watchdog introuvable: $watchdogPath" }
if (-not (Test-Path -LiteralPath $NodePath)) { throw "Node.js introuvable: $NodePath" }
New-Item -ItemType Directory -Force -Path $LogRoot, (Split-Path -Parent $ReportPath) | Out-Null

function Quote-TaskArgument([string]$Value) { '"' + $Value.Replace('"', '\"') + '"' }

$arguments = @(
  (Quote-TaskArgument $watchdogPath),
  '--site-dir', (Quote-TaskArgument $siteRootResolved),
  '--node', (Quote-TaskArgument $NodePath),
  '--log-dir', (Quote-TaskArgument $LogRoot),
  '--report', (Quote-TaskArgument $ReportPath)
) -join ' '

$action = New-ScheduledTaskAction -Execute $NodePath -Argument $arguments -WorkingDirectory $siteRootResolved
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$recurringTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($startupTrigger, $recurringTrigger) -Principal $principal -Settings $settings -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$principalSid = try { (New-Object System.Security.Principal.NTAccount([string]$task.Principal.UserId)).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { [string]$task.Principal.UserId }
if ($principalSid -ne 'S-1-5-18' -or $task.Principal.LogonType -ne 'ServiceAccount') { throw "Principal invalide: $($task.Principal.UserId)/$principalSid/$($task.Principal.LogonType)" }
if ($task.Actions.Execute -ne $NodePath -or $task.Actions.Arguments -notlike '*local-site-watchdog.js*') { throw 'Action watchdog invalide apres enregistrement.' }
$hasStartup = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' }).Count -gt 0
$hasFiveMinutes = @($task.Triggers | Where-Object { $_.Repetition.Interval -eq 'PT5M' }).Count -gt 0
if (-not $hasStartup -or -not $hasFiveMinutes) { throw "Declencheurs invalides: startup=$hasStartup repetition5m=$hasFiveMinutes" }

Write-Output ("task={0} state={1} principal={2} startup={3} interval5m={4} watchdog={5}" -f $task.TaskName, $task.State, $task.Principal.UserId, $hasStartup, $hasFiveMinutes, $watchdogPath)
if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Output ("started={0}" -f $TaskName)
}