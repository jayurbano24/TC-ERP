# Restaura copia autorizada en volumen upgrade vacío. Sin pg_restore --clean.
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
$dumpPath = $manifest.files[0].path
if (-not (Test-Path $dumpPath)) { throw "Dump missing: $dumpPath" }

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
if ($StartStack) {
  npx supabase start --workdir $workdir 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = $prevEap; throw 'supabase start failed' }
}

$target = Get-UpgradeTargetFromWorkdir -Root $root -Workdir $workdir
Set-UpgradeEnvironmentVariables -Target $target
Assert-UpgradeEnvironmentPresent

Write-Host "Restoring (no --clean) into $($target.DbUrl) ..."

# Preserva roles/extensiones del contenedor; restaura esquemas/datos del dump.
pg_restore --dbname=$env:UPGRADE_DATABASE_URL --no-owner --role=postgres --exit-on-error $dumpPath
$code = $LASTEXITCODE
Clear-UpgradeEnvironmentVariables
$ErrorActionPreference = $prevEap

if ($code -ne 0) { throw "pg_restore exited with $code" }

Write-Host 'Restore complete. Export before evidence next (immutable).'
