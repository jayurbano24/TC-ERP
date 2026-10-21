# Export autocontenido: bytes del índice Git (misma fuente que prepare-manifest).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exportRoot = if ($env:TC_ERP_PACKAGE_EXPORT_ROOT) { $env:TC_ERP_PACKAGE_EXPORT_ROOT } else {
  Join-Path $env:TEMP "tc-erp-upgrade-export-$([Guid]::NewGuid().ToString('N'))"
}

New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null
node (Join-Path $root 'scripts\upgrade\materialize-git-index-export.mjs') $exportRoot
if ($LASTEXITCODE -ne 0) { throw 'materialize-git-index-export failed' }

$nmSrc = Join-Path $root 'node_modules'
$nmDst = Join-Path $exportRoot 'node_modules'
if (-not (Test-Path $nmDst) -and (Test-Path $nmSrc)) {
  cmd /c "mklink /J `"$nmDst`" `"$nmSrc`""
}

Write-Output $exportRoot
