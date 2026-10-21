# Verificación desde export autocontenido: manifiesto + tests (sin reescribir manifiesto).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exportRoot = (& (Join-Path $root 'scripts\export-git-index-package.ps1') | Select-Object -Last 1)
$manifestRel = 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json'

Push-Location $exportRoot
try {
  node scripts/upgrade/verify-package-manifest.mjs $exportRoot $manifestRel
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "Upgrade package export verified ($exportRoot)"
  npm run test:upgrade:package
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
