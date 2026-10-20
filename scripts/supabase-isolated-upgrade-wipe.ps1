# Vacía SOLO el stack upgrade (54342): stop sin backup. No toca 54322/54332.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'upgrade\resolve-upgrade-target.ps1')
& (Join-Path $PSScriptRoot 'supabase-isolated-upgrade-init.ps1') | Out-Null
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
npx supabase stop --workdir $workdir --no-backup 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0) { throw 'supabase stop failed for upgrade stack' }

Write-Host 'Upgrade stack stopped (empty volume path for restore). Start after pg_restore procedure.'
