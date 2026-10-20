# migration up incremental; requiere plan aprobado + historial restaurado exportado.
param(
  [Parameter(Mandatory = $true)]
  [string]$RestoredMigrationHistoryJson
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'upgrade\resolve-upgrade-target.ps1')

node (Join-Path $PSScriptRoot 'upgrade\compute-migration-plan.mjs') $RestoredMigrationHistoryJson
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot 'supabase-isolated-upgrade-init.ps1') | Out-Null
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'

$target = Get-UpgradeTargetFromWorkdir -Root $root -Workdir $workdir
Set-UpgradeEnvironmentVariables -Target $target
Assert-UpgradeEnvironmentPresent

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$log = Join-Path $root 'artifacts/upgrade-recovery-a14b4ce/migration-up.log'
$logDir = Split-Path $log -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

npx supabase migration up --workdir $workdir --local 2>&1 | Tee-Object -FilePath $log
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap
Clear-UpgradeEnvironmentVariables

if ($code -ne 0) { exit $code }
if (Select-String -Path $log -Pattern 'Skipping migration .+\.sql\.\.\.') {
  Write-Error 'Unexpected skipped migrations during upgrade.'
  exit 1
}
Write-Host "migration up log: $log"
