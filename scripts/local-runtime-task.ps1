param(
  [string]$SiteRoot = 'F:\immeubleassur-sync\immeubleassur.com',
  [string]$DataRoot = 'F:\immeubleassur-data',
  [string]$RuntimeRoot = 'F:\immeubleassur-runtime',
  [string]$BackupRoot = 'F:\immeubleassur-backups\sqlite'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $SiteRoot

# Self-heal an older task registration that used an interactive token.
$taskName = 'ImmeubleAssur Runtime Reports'
try {
  $currentTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if (@('SYSTEM', 'S-1-5-18') -contains [string]$currentTask.Principal.UserId -and $currentTask.Principal.LogonType -ne 'ServiceAccount') {
    $installer = Join-Path $SiteRoot 'scripts\install-local-runtime-task.ps1'
    & PowerShell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $installer -TaskName $taskName -SiteRoot $SiteRoot -WrapperPath $MyInvocation.MyCommand.Path -RunNow
    if ($LASTEXITCODE -ne 0) { throw "Runtime task self-heal failed with exit code $LASTEXITCODE" }
    exit 0
  }
} catch {
  if ($_.Exception.Message -like 'Runtime task self-heal failed*') { throw }
}
$env:LOCAL_SQLITE_DB = Join-Path $DataRoot 'immeubleassur.sqlite'
$env:LOCAL_SQLITE_BACKUP_DIR = $BackupRoot
$env:LOCAL_PRODUCTION_MONITOR_REPORT = 'F:\immeubleassur-monitor\latest.json'
$env:LOCAL_LEAD_SLA_REPORT = 'F:\immeubleassur-monitor\lead-sla-latest.json'
$env:LOCAL_LEAD_QUALITY_REPORT = 'F:\immeubleassur-monitor\lead-quality-latest.json'
$env:LOCAL_CONVERSION_FUNNEL_REPORT = 'F:\immeubleassur-monitor\conversion-funnel-latest.json'
$env:LOCAL_INTENT_CONVERSION_REPORT = Join-Path $RuntimeRoot 'reports\local-intent-conversion-report.json'
$env:LOCAL_INTENT_CONVERSION_PUBLIC_REPORT = Join-Path $RuntimeRoot 'assets\local-intent-conversion-latest.json'
$env:LOCAL_SOURCE_QUALITY_REPORT = Join-Path $RuntimeRoot 'reports\local-source-quality-report.json'
$env:LOCAL_SOURCE_QUALITY_PUBLIC_REPORT = Join-Path $RuntimeRoot 'assets\local-source-quality-latest.json'
$env:LOCAL_SEO_BACKLOG_REPORT = 'F:\immeubleassur-monitor\seo-backlog-latest.json'
$env:LOCAL_RUNTIME_ASSETS_ROOT = $RuntimeRoot
$env:LOCAL_RUNTIME_REPORTS_ROOT = Join-Path $RuntimeRoot 'reports'
$env:LOCAL_IMAP_REPORT = Join-Path $RuntimeRoot 'reports\local-imap-sync-report.json'
$env:LOCAL_TLS_REPORT = Join-Path $RuntimeRoot 'reports\local-tls-certificate-report.json'
$env:LOCAL_CONTRACT_RENEWAL_REPORT = Join-Path $RuntimeRoot 'reports\local-contract-renewal-report.json'
$env:LOCAL_GROWTH_OPS_RUNTIME_ONLY = '1'
$env:LOCAL_GROWTH_OPS_RUNTIME_ASSET = Join-Path $RuntimeRoot 'assets\local-growth-ops-latest.json'
$env:LOCAL_MONITOR_ALERTS = '0'
$env:LOCAL_RUNTIME_ONLY = '1'
$env:LOCAL_LEAD_SLA_ALERTS = '0'
New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeRoot 'assets'), (Join-Path $RuntimeRoot 'reports'), $BackupRoot | Out-Null
& 'C:\Program Files\nodejs\node.exe' 'scripts\local-runtime-report-cycle.js'
$reportExitCode = $LASTEXITCODE

# Refresh only connectors that are configured and ready. The runner keeps
# fallbacks operational, never prints secret values, and applies the SerpApi
# cooldown so the 15-minute runtime task does not burn quota.
& 'C:\Program Files\nodejs\node.exe' 'scripts\live-ready-connectors-runner.js'
$liveConnectorExitCode = $LASTEXITCODE

if ($reportExitCode -ne 0) { exit $reportExitCode }
exit $liveConnectorExitCode