$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $PSScriptRoot
Set-Location $siteRoot
$env:LOCAL_SQLITE_DB = 'F:\immeubleassur-data\immeubleassur.sqlite'
$env:LOCAL_SQLITE_BACKUP_DIR = 'F:\immeubleassur-backups\sqlite'
$env:LOCAL_SQLITE_BACKUP_MIRROR_DIR = 'C:\Users\Administrateur\immeubleassur-backup-mirror'
$env:LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED = '1'
$env:LOCAL_RUNTIME_REPORTS_ROOT = 'F:\immeubleassur-runtime\reports'
$env:LOCAL_PRODUCTION_MONITOR_REPORT = 'F:\immeubleassur-monitor\latest.json'
$env:LOCAL_MONITOR_ALERTS = '1'
$env:LOCAL_MONITOR_ALERT_TO = 'team@immeubleassur.com'
$env:LOCAL_MONITOR_ALERT_COOLDOWN_MINUTES = '60'
$env:LOCAL_MONITOR_ALERT_STATE = 'F:\immeubleassur-monitor\alert-state.json'
& 'C:\Program Files\nodejs\node.exe' scripts\local-production-monitor.js --origin https://immeubleassur.com --db $env:LOCAL_SQLITE_DB --backup-dir $env:LOCAL_SQLITE_BACKUP_DIR --out $env:LOCAL_PRODUCTION_MONITOR_REPORT
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
