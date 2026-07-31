param(
  [string]$SiteDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$NodePath = 'C:\Program Files\nodejs\node.exe',
  [int]$Port = 8790,
  [string]$LogDir = '',
  [string]$ReportPath = '',
  [int]$StartupWaitSeconds = 12,
  [switch]$ForceRestart
)

$ErrorActionPreference = 'Stop'

function Resolve-AbsolutePath([string]$PathValue) {
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $PathValue))
}

function New-WatchdogReport([string]$Status, [hashtable]$Details) {
  $report = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString('o')
    status = $Status
    site_dir = $script:SiteDirResolved
    port = $Port
    details = $Details
  }
  New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($script:ReportPathResolved)) -Force | Out-Null
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $script:ReportPathResolved -Encoding UTF8
  return $report
}

function Test-LocalHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 6
    $body = $response.Content | ConvertFrom-Json
    return [ordered]@{
      ok = ($response.StatusCode -eq 200 -and $body.success -eq $true -and $body.status -eq 'ok')
      status_code = $response.StatusCode
      body = $body
      error = ''
    }
  } catch {
    return [ordered]@{
      ok = $false
      status_code = 0
      body = $null
      error = $_.Exception.Message
    }
  }
}

function Get-LocalSiteProcesses {
  Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -in @('node.exe', 'cmd.exe')) -and
    ($_.CommandLine -like '*local-production-server.js*') -and
    ($_.CommandLine -like "*$($script:SiteDirResolved)*")
  }
}

function Stop-LocalSiteProcesses {
  $stopped = @()
  foreach ($process in (Get-LocalSiteProcesses)) {
    $stopped += [ordered]@{
      process_id = $process.ProcessId
      name = $process.Name
    }
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  return $stopped
}

function Start-LocalSite {
  $serverScript = Join-Path $script:SiteDirResolved 'scripts\local-production-server.js'
  if (!(Test-Path -LiteralPath $serverScript)) {
    throw "local-production-server.js introuvable: $serverScript"
  }
  if (!(Test-Path -LiteralPath $NodePath)) {
    throw "Node.js introuvable: $NodePath"
  }

  New-Item -ItemType Directory -Path $script:LogDirResolved -Force | Out-Null
  $outLog = Join-Path $script:LogDirResolved 'local-site.out.log'
  $errLog = Join-Path $script:LogDirResolved 'local-site.err.log'
  Add-Content -LiteralPath $outLog -Value "--- watchdog launch $(Get-Date -Format o) ---"
  Add-Content -LiteralPath $errLog -Value "--- watchdog launch $(Get-Date -Format o) ---"

  $commandLine = 'cmd.exe /d /c ""' +
    $NodePath +
    '" --trace-exit --trace-uncaught "' +
    $serverScript +
    '" 1>>"' +
    $outLog +
    '" 2>>"' +
    $errLog +
    '""'

  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $commandLine
    CurrentDirectory = $script:SiteDirResolved
  }

  return [ordered]@{
    return_value = $result.ReturnValue
    process_id = $result.ProcessId
    command = 'node scripts/local-production-server.js'
    out_log = $outLog
    err_log = $errLog
  }
}

$script:SiteDirResolved = Resolve-AbsolutePath $SiteDir
if (!$LogDir) {
  $LogDir = Join-Path $script:SiteDirResolved 'data\logs'
}
$script:LogDirResolved = Resolve-AbsolutePath $LogDir
if (!$ReportPath) {
  $ReportPath = Join-Path $script:LogDirResolved 'local-site-watchdog-report.json'
}
$script:ReportPathResolved = Resolve-AbsolutePath $ReportPath

Set-Location -LiteralPath $script:SiteDirResolved

$before = Test-LocalHealth
if ($before.ok -and !$ForceRestart) {
  New-WatchdogReport 'healthy' @{
    action = 'none'
    health_before = $before
    processes = @(Get-LocalSiteProcesses | Select-Object ProcessId, Name, CommandLine)
  } | Out-Null
  Write-Output "immeubleassur_watchdog=healthy"
  exit 0
}

$stopped = Stop-LocalSiteProcesses
$started = Start-LocalSite
Start-Sleep -Seconds $StartupWaitSeconds
$after = Test-LocalHealth

$status = if ($after.ok) { 'recovered' } else { 'failed' }
New-WatchdogReport $status @{
  action = 'restart'
  health_before = $before
  health_after = $after
  stopped = $stopped
  started = $started
  processes = @(Get-LocalSiteProcesses | Select-Object ProcessId, Name, CommandLine)
} | Out-Null

if ($after.ok) {
  Write-Output "immeubleassur_watchdog=recovered"
  exit 0
}

Write-Error "immeubleassur_watchdog=failed"
exit 1
