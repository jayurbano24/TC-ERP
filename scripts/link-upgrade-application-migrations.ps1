# Enlaza supabase/migrations del workdir upgrade a una carpeta (staging o repo).
param(
  [Parameter(Mandatory = $true)]
  [string]$MigrationsSource
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'
$migrations = Join-Path $workdir 'supabase\migrations'

if (-not (Test-Path $MigrationsSource)) {
  throw "Migrations source missing: $MigrationsSource"
}

if (Test-Path $migrations) {
  $item = Get-Item $migrations -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    cmd /c "rmdir `"$migrations`""
  } else {
    throw "migrations path exists and is not a junction: $migrations"
  }
}

cmd /c "mklink /J `"$migrations`" `"$MigrationsSource`""
Write-Host "Linked migrations -> $MigrationsSource"
