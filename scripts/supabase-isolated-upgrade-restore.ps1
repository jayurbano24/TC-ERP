# Restaura copia autorizada. Init sin migrations/ hasta post-restore.
param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath,
  [switch]$StartStack
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'upgrade\resolve-upgrade-target.ps1')

node (Join-Path $PSScriptRoot 'upgrade\validate-backup-artifact.mjs') $ManifestPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot 'supabase-isolated-upgrade-wipe.ps1')
& (Join-Path $PSScriptRoot 'supabase-isolated-upgrade-init.ps1') | Out-Null
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$files = @($manifest.files)
if ($files.Count -gt 1) {
  if (-not $manifest.restoreOrder) { throw 'Multi-file backup requires restoreOrder[]' }
  $order = @($manifest.restoreOrder)
  $files = @(
    foreach ($orderedPath in $order) {
      $entry = $manifest.files | Where-Object { $_.path -eq $orderedPath }
      if (-not $entry) { throw "restoreOrder references missing path: $orderedPath" }
      $entry
    }
  )
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
if ($StartStack) {
  npx supabase start --workdir $workdir 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = $prevEap; throw 'supabase start failed' }
}

$target = Get-UpgradeTargetFromWorkdir -Root $root -Workdir $workdir
Set-UpgradeEnvironmentVariables -Target $target
Assert-UpgradeEnvironmentPresent

node (Join-Path $PSScriptRoot 'upgrade\assert-pre-restore-database.mjs') $env:UPGRADE_DATABASE_URL
if ($LASTEXITCODE -ne 0) {
  Clear-UpgradeEnvironmentVariables
  $ErrorActionPreference = $prevEap
  exit $LASTEXITCODE
}

foreach ($entry in $files) {
  $dumpPath = $entry.path
  if (-not (Test-Path $dumpPath)) { throw "Dump missing: $dumpPath" }
  Write-Host "Restoring (no --clean) $dumpPath into $($target.DbUrl) ..."
  pg_restore --dbname=$env:UPGRADE_DATABASE_URL --no-owner --role=postgres --exit-on-error $dumpPath
  if ($LASTEXITCODE -ne 0) {
    Clear-UpgradeEnvironmentVariables
    $ErrorActionPreference = $prevEap
    throw "pg_restore exited with $LASTEXITCODE"
  }
}

Clear-UpgradeEnvironmentVariables
$ErrorActionPreference = $prevEap

Write-Host 'Restore complete. Extract schema_migrations + before evidence next (still no app migrations junction).'
