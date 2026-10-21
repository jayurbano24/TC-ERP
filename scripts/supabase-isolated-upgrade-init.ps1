# Prepara workdir upgrade (54342). Sin restore ni migraciones de aplicación por defecto.
param(
  [switch]$LinkApplicationMigrations,
  [string]$MigrationsSource
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$isoRoot = Join-Path $root 'supabase\isolated-upgrade'
$versionedConfig = Join-Path $isoRoot 'config.toml'
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'
$supa = Join-Path $workdir 'supabase'
$migrations = Join-Path $supa 'migrations'
$srcMigrations = if ($MigrationsSource) { $MigrationsSource } else { Join-Path $root 'supabase\migrations' }

if (-not (Test-Path $versionedConfig)) {
  throw "Missing versioned upgrade config: $versionedConfig"
}

& (Join-Path $PSScriptRoot 'assert-isolated-upgrade-target.ps1') -Workdir $isoRoot

if (-not (Test-Path $workdir)) { New-Item -ItemType Directory -Path $workdir -Force | Out-Null }
if (-not (Test-Path $supa)) { New-Item -ItemType Directory -Path $supa -Force | Out-Null }
Copy-Item -Path $versionedConfig -Destination (Join-Path $supa 'config.toml') -Force

if ($LinkApplicationMigrations) {
  & (Join-Path $PSScriptRoot 'link-upgrade-application-migrations.ps1') -MigrationsSource $srcMigrations
} elseif (Test-Path $migrations) {
  $item = Get-Item $migrations -Force -ErrorAction SilentlyContinue
  if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    Write-Warning "Removing premature migrations junction (pre-restore policy)."
    cmd /c "rmdir `"$migrations`""
  }
}

& (Join-Path $PSScriptRoot 'assert-isolated-upgrade-target.ps1') -Workdir $supa
Write-Host "Upgrade workdir ready: $workdir"
if (-not $LinkApplicationMigrations) {
  Write-Host "Platform-only init (no application migrations folder)."
}
