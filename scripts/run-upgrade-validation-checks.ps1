# SQL gates + fingerprint JSON inmutable por fase.
param(
  [ValidateSet('before', 'after', 'recovered')]
  [string]$Phase = 'before'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'upgrade\resolve-upgrade-target.ps1')
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'

$target = Get-UpgradeTargetFromWorkdir -Root $root -Workdir $workdir
Set-UpgradeEnvironmentVariables -Target $target
Assert-UpgradeEnvironmentPresent

$evidenceRoot = Join-Path $root 'artifacts/upgrade-recovery-a14b4ce/evidence'
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
$phaseLogDir = Join-Path $evidenceRoot "$Phase-logs"
New-Item -ItemType Directory -Path $phaseLogDir -Force | Out-Null

node (Join-Path $PSScriptRoot 'upgrade\export-evidence.mjs') $Phase $evidenceRoot
if ($LASTEXITCODE -ne 0) { Clear-UpgradeEnvironmentVariables; exit $LASTEXITCODE }

$sqlDir = Join-Path $root 'supabase\scripts\upgrade_validation'
$gateFiles = @('01_schema_migrations_inventory.sql', '09_gates_invariants.sql')
if ($Phase -eq 'recovered') { $gateFiles += '10_residual_objects_after_recovery.sql' }

foreach ($name in $gateFiles) {
  $out = Join-Path $phaseLogDir ($name -replace '\.sql$', '.log')
  psql $env:UPGRADE_DATABASE_URL -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir $name) *> $out
  if ($LASTEXITCODE -ne 0) {
    Clear-UpgradeEnvironmentVariables
    throw "Gate failed: $name (see $out)"
  }
}

if ($Phase -eq 'after' -or $Phase -eq 'recovered') {
  node (Join-Path $PSScriptRoot 'upgrade\compare-evidence.mjs') $evidenceRoot
  if ($LASTEXITCODE -ne 0) { Clear-UpgradeEnvironmentVariables; exit $LASTEXITCODE }
}

Clear-UpgradeEnvironmentVariables
Write-Host "Evidence phase '$Phase' -> $evidenceRoot\$Phase.json (+ logs in $phaseLogDir)"
