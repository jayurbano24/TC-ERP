# Prepara workdir upgrade (54342). No restaura dump ni ejecuta migraciones.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$isoRoot = Join-Path $root 'supabase\isolated-upgrade'
$versionedConfig = Join-Path $isoRoot 'config.toml'
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'
$supa = Join-Path $workdir 'supabase'
$migrations = Join-Path $supa 'migrations'
$srcMigrations = Join-Path $root 'supabase\migrations'

if (-not (Test-Path $versionedConfig)) {
  throw "Missing versioned upgrade config: $versionedConfig"
}

& (Join-Path $PSScriptRoot 'assert-isolated-upgrade-target.ps1') -Workdir $isoRoot

if (-not (Test-Path $workdir)) { New-Item -ItemType Directory -Path $workdir -Force | Out-Null }
if (-not (Test-Path $supa)) { New-Item -ItemType Directory -Path $supa -Force | Out-Null }
Copy-Item -Path $versionedConfig -Destination (Join-Path $supa 'config.toml') -Force

if (-not (Test-Path $migrations)) {
  cmd /c "mklink /J `"$migrations`" `"$srcMigrations`""
}

& (Join-Path $PSScriptRoot 'assert-isolated-upgrade-target.ps1') -Workdir $supa
Write-Host "Upgrade workdir ready: $workdir"
Write-Host "Next: restore authorized dump, then npm run supabase:upgrade:migrate"
