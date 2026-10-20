# Reset SOLO tc-erp-isolated-verify (54332). No toca tc-erp-local (54322).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$isoRoot = Join-Path $root 'supabase\isolated'
$versionedConfig = Join-Path $isoRoot 'config.toml'
$workdir = Join-Path $root '.supabase-isolated-work'
$supa = Join-Path $workdir 'supabase'
$migrations = Join-Path $supa 'migrations'
$srcMigrations = Join-Path $root 'supabase\migrations'

if (-not (Test-Path $versionedConfig)) {
  throw "Missing versioned isolated config: $versionedConfig (refusing any fallback to tc-erp-local / 54322)."
}

& (Join-Path $PSScriptRoot 'assert-isolated-supabase-target.ps1') -Workdir $isoRoot

if (-not (Test-Path $workdir)) { New-Item -ItemType Directory -Path $workdir -Force | Out-Null }
if (-not (Test-Path $supa)) { New-Item -ItemType Directory -Path $supa -Force | Out-Null }

Copy-Item -Path $versionedConfig -Destination (Join-Path $supa 'config.toml') -Force

if (-not (Test-Path $migrations)) {
  cmd /c "mklink /J `"$migrations`" `"$srcMigrations`""
}

Push-Location $root
node scripts/verify-migration-filenames.mjs
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
node scripts/verify-bootstrap-reproducibility.mjs
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot 'assert-isolated-supabase-target.ps1') -Workdir (Join-Path $workdir 'supabase')

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

npx supabase stop --workdir $workdir --no-backup 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = $prevEap; Pop-Location; exit $LASTEXITCODE }
npx supabase start --workdir $workdir 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = $prevEap; Pop-Location; exit $LASTEXITCODE }

$resetOut = Join-Path $root '.tmp-isolated-db-reset.log'
npx supabase db reset --workdir $workdir --local --no-seed 2>&1 | Tee-Object -FilePath $resetOut
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($code -eq 0 -and (Test-Path $resetOut)) {
  $skip = Select-String -Path $resetOut -Pattern 'Skipping migration .+\.sql\.\.\.'
  if ($skip) {
    Write-Error "Unexpected skipped migrations:`n$($skip | ForEach-Object { $_.Line })"
    $code = 1
  }
}
Pop-Location
exit $code
