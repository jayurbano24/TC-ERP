# Valida snapshot desde copia del índice Git (sin archivos untracked del working tree).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exportRoot = Join-Path $env:TEMP "tc-erp-index-export-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null

Push-Location $root
try {
  git checkout-index -a -f --prefix="$exportRoot/"
  if ($LASTEXITCODE -ne 0) { throw "git checkout-index failed" }

  Push-Location $exportRoot
  node scripts/verify-migration-filenames.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node scripts/verify-bootstrap-reproducibility.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node scripts/verify-bootstrap-reproducibility.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Index export validation OK at $exportRoot"
} finally {
  Pop-Location
  Pop-Location
}
