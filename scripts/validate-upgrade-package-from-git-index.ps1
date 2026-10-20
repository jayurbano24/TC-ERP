# Verifica manifiesto del paquete desde export limpio del indice Git (sin working tree prestado).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exportRoot = Join-Path $env:TEMP "tc-erp-upgrade-pkg-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null

function Compare-ManifestEntries {
  param($Committed, $Generated)
  if ($Committed.validationPackageVersion -ne $Generated.validationPackageVersion) {
    throw 'validationPackageVersion mismatch'
  }
  if ($Committed.targetApplicationCommit -ne $Generated.targetApplicationCommit) {
    throw 'targetApplicationCommit mismatch'
  }
  if ($Committed.fileCount -ne $Generated.fileCount) {
    throw "fileCount mismatch ($($Committed.fileCount) vs $($Generated.fileCount))"
  }
  $genMap = @{}
  foreach ($f in $Generated.files) { $genMap[$f.path] = $f.sha256 }
  foreach ($f in $Committed.files) {
    if (-not $genMap.ContainsKey($f.path)) {
      throw "Missing path in regenerated manifest: $($f.path)"
    }
    if ($genMap[$f.path] -ne $f.sha256) {
      throw "SHA-256 drift for $($f.path)"
    }
  }
}

Push-Location $root
try {
  git checkout-index -a -f --prefix="$exportRoot/"
  if ($LASTEXITCODE -ne 0) { throw 'git checkout-index failed' }

  $manifestGitPath = 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json'
  $committedJson = git show ":$manifestGitPath" 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'PACKAGE-MANIFEST.sha256.json not in git index' }
  $committed = $committedJson | ConvertFrom-Json

  foreach ($f in $committed.files) {
    $gitRel = $f.path -replace '\\', '/'
    git rev-parse ":$gitRel" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Index missing file: $gitRel" }
    $abs = Join-Path $exportRoot ($f.path -replace '/', '\')
    if (-not (Test-Path $abs)) { throw "Export missing file: $($f.path)" }
  }

  $regeneratedJson = node scripts/upgrade/generate-package-manifest.mjs --stdout
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $regenerated = $regeneratedJson | ConvertFrom-Json
  Compare-ManifestEntries -Committed $committed -Generated $regenerated

  Write-Host "Upgrade package index export OK ($($committed.fileCount) files verified)"
  npm run test:upgrade:package
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
