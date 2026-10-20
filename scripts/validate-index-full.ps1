# Exporta el índice Git, verifica ensambladores (×2) y ejecuta reset + suite aislada.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exportRoot = Join-Path $env:TEMP "tc-erp-index-full-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null

Push-Location $root
try {
  git checkout-index -a -f --prefix="$exportRoot/"
  if ($LASTEXITCODE -ne 0) { throw 'git checkout-index failed' }

  Push-Location $exportRoot
  try {
    node scripts/verify-migration-filenames.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $hBefore = (Get-FileHash -Algorithm SHA256 "supabase/migrations/014_erp_legacy_bootstrap.sql").Hash
    node scripts/verify-bootstrap-reproducibility.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $hAfter1 = (Get-FileHash -Algorithm SHA256 "supabase/migrations/014_erp_legacy_bootstrap.sql").Hash
    node scripts/verify-bootstrap-reproducibility.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $hAfter2 = (Get-FileHash -Algorithm SHA256 "supabase/migrations/014_erp_legacy_bootstrap.sql").Hash
    if ($hBefore -ne $hAfter1 -or $hBefore -ne $hAfter2) {
      throw "Bootstrap artifact hash changed during verify: before=$hBefore after=$hAfter2"
    }

    npm run supabase:isolated:reset
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }

  npm run test:classify:fullstack
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
