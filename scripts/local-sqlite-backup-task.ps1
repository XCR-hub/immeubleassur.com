$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $PSScriptRoot
Set-Location $siteRoot
$env:LOCAL_SQLITE_DB = 'F:\immeubleassur-data\immeubleassur.sqlite'
$env:LOCAL_SQLITE_BACKUP_DIR = 'F:\immeubleassur-backups\sqlite'
$env:LOCAL_SQLITE_BACKUP_MIRROR_DIR = 'C:\Users\Administrateur\immeubleassur-backup-mirror'
$env:LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED = '1'
$env:LOCAL_SQLITE_BACKUP_KEEP = '32'
& 'C:\Program Files\nodejs\node.exe' scripts\local-sqlite-backup.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
