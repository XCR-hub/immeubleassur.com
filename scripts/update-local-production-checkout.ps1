param(
  [string]$SiteRoot = 'F:\immeubleassur-sync\immeubleassur.com',
  [string]$Remote = 'origin',
  [string]$Branch = 'main',
  [string]$ReportPath = '',
  [ValidateRange(1, 1500)]
  [int]$LockTimeoutSeconds = 1500,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$mutex = $null
$acquired = $false
$startedAt = [DateTime]::UtcNow

function Invoke-Git([string[]]$Arguments) {
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & git -C $SiteRoot @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if ($exitCode -ne 0) { throw "git $($Arguments -join ' ') failed: $($output -join ' ')" }
  return @($output | ForEach-Object { $_.ToString() })
}

function Write-DeploymentReport([string]$Status, [string]$Before, [string]$After, [string]$ErrorMessage = '') {
  if ([string]::IsNullOrWhiteSpace($ReportPath)) { return }
  $parent = Split-Path -Parent $ReportPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  [ordered]@{
    generated_at = [DateTime]::UtcNow.ToString('o')
    status = $Status
    validate_only = [bool]$ValidateOnly
    revision_before = $Before
    revision_after = $After
    duration_seconds = [Math]::Round(([DateTime]::UtcNow - $startedAt).TotalSeconds, 1)
    safeguards = @('named-checkout-mutex', 'clean-worktree-required', 'fast-forward-only', 'branch-pinned', 'no-local-paths')
    error = $ErrorMessage
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReportPath -Encoding utf8
}

$before = ''
try {
  $mutexSecurity = New-Object System.Security.AccessControl.MutexSecurity
  $authenticatedUsers = New-Object Security.Principal.SecurityIdentifier('S-1-5-11')
  $mutexRights = [System.Security.AccessControl.MutexRights]::Modify -bor [System.Security.AccessControl.MutexRights]::Synchronize
  $mutexRule = New-Object System.Security.AccessControl.MutexAccessRule($authenticatedUsers, $mutexRights, [System.Security.AccessControl.AccessControlType]::Allow)
  $mutexSecurity.AddAccessRule($mutexRule)
  $createdNew = $false
  $mutex = New-Object Threading.Mutex($false, 'Global\ImmeubleAssurProductionCheckout', [ref]$createdNew, $mutexSecurity)
  try { $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds($LockTimeoutSeconds)) }
  catch [Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { throw "Production checkout lock timeout after $LockTimeoutSeconds second(s)." }
  $resolvedRoot = [IO.Path]::GetFullPath($SiteRoot)
  if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot '.git'))) { throw 'Production checkout is not a Git repository.' }
  $branchNow = (Invoke-Git @('symbolic-ref', '--short', 'HEAD') | Select-Object -First 1).Trim()
  if ($branchNow -ne $Branch) { throw "Production checkout branch is '$branchNow', expected '$Branch'." }
  if ((Invoke-Git @('status', '--porcelain')).Count -gt 0) { throw 'Production checkout has uncommitted changes.' }
  $before = (Invoke-Git @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
  if (-not $ValidateOnly) { Invoke-Git @('pull', '--ff-only', $Remote, $Branch) | Out-Null }
  $after = (Invoke-Git @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
  $modeStatus = if ($ValidateOnly) { 'validated' } else { 'updated' }
  $modeVerb = if ($ValidateOnly) { 'validated' } else { 'updated' }
  Write-DeploymentReport $modeStatus $before $after
  Write-Output "Production checkout ${modeVerb}: $after"
} catch {
  Write-DeploymentReport 'failed' $before '' $_.Exception.Message
  throw
} finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  if ($null -ne $mutex) { $mutex.Dispose() }
}
