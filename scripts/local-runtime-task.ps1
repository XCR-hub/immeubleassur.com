param(
  [string]$SiteRoot = 'F:\immeubleassur-sync\immeubleassur.com',
  [string]$DataRoot = 'F:\immeubleassur-data',
  [string]$RuntimeRoot = 'F:\immeubleassur-runtime',
  [string]$BackupRoot = 'F:\immeubleassur-backups\sqlite'
)

$ErrorActionPreference = 'Stop'
$checkoutMutex = New-Object Threading.Mutex($false, 'Global\ImmeubleAssurProductionCheckout')
$checkoutLockAcquired = $false
try {
try { $checkoutLockAcquired = $checkoutMutex.WaitOne([TimeSpan]::FromMinutes(25)) }
catch [Threading.AbandonedMutexException] { $checkoutLockAcquired = $true }
if (-not $checkoutLockAcquired) { throw 'Production checkout lock timeout after 25 minutes.' }
Set-Location -LiteralPath $SiteRoot

# Self-heal an older task registration that used an interactive token.
$taskName = 'ImmeubleAssur Runtime Reports'
$taskFile = Join-Path $env:windir ('System32\Tasks\' + $taskName)
try {
  $legacyXml = if (Test-Path -LiteralPath $taskFile) { Get-Content -LiteralPath $taskFile -Raw } else { '' }
  if ($legacyXml -match '<LogonType>InteractiveToken</LogonType>') {
    & schtasks.exe /Change /TN $taskName /RU SYSTEM /RL HIGHEST | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Runtime task self-heal failed with exit code $LASTEXITCODE" }
  }
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
$env:LOCAL_SQLITE_BACKUP_MIRROR_DIR = 'C:\Users\Administrateur\immeubleassur-backup-mirror'
$env:LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED = '1'
$env:LOCAL_SQLITE_RESTORE_DRILL_DIR = 'F:\immeubleassur-restore-drill'
$env:LOCAL_SQLITE_RESTORE_DRILL_PREFER_MIRROR = '1'
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
$env:NEWSLETTER_AUTO_SEND = '1'
$env:LOCAL_NEWSLETTER_DELIVERY_REPORT = Join-Path $RuntimeRoot 'reports\local-newsletter-delivery-report.json'
$env:LOCAL_NEWSLETTER_DELIVERY_CONTRACT_REPORT = Join-Path $RuntimeRoot 'reports\newsletter-delivery-contract-report.json'
$env:LOCAL_IMAP_REPORT = Join-Path $RuntimeRoot 'reports\local-imap-sync-report.json'
$env:LOCAL_TLS_REPORT = Join-Path $RuntimeRoot 'reports\local-tls-certificate-report.json'
$env:LOCAL_CONTRACT_RENEWAL_REPORT = Join-Path $RuntimeRoot 'reports\local-contract-renewal-report.json'
$env:LOCAL_GROWTH_OPS_RUNTIME_ONLY = '1'
$env:LOCAL_GROWTH_OPS_RUNTIME_ASSET = Join-Path $RuntimeRoot 'assets\local-growth-ops-latest.json'
$env:LOCAL_MONITOR_ALERTS = '1'
$env:LOCAL_EDITORIAL_REVIEW_ALERTS = '1'
$env:LOCAL_EDITORIAL_REVIEW_ALERT_TO = 'team@immeubleassur.com'
$env:LOCAL_EDITORIAL_REVIEW_WARNING_COOLDOWN_MINUTES = '1440'
$env:LOCAL_EDITORIAL_REVIEW_CRITICAL_COOLDOWN_MINUTES = '360'
$env:INDEXNOW_SUBMIT = '1'
$env:LOCAL_PRIVACY_RETENTION_APPLY = '1'
$env:LOCAL_PRIVACY_TECHNICAL_DAYS = '30'
$env:LOCAL_PRIVACY_TELEMETRY_DAYS = '180'
$env:LOCAL_PRIVACY_AUDIT_DAYS = '180'
$env:LOCAL_RUNTIME_ONLY = '1'
$env:LOCAL_LEAD_SLA_ALERTS = '1'
New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeRoot 'assets'), (Join-Path $RuntimeRoot 'reports'), $BackupRoot | Out-Null
& 'C:\Program Files\nodejs\node.exe' 'scripts\local-runtime-report-cycle.js'
$reportExitCode = $LASTEXITCODE

# Connectors are already executed once inside the strict runtime cycle.
exit $reportExitCode
} finally {
  if ($checkoutLockAcquired) { $checkoutMutex.ReleaseMutex() }
  $checkoutMutex.Dispose()
}
