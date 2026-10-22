$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'dist\series-salida-raw.txt'
$content = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($content)) {
  Write-Host 'Portapapeles vacío. Copie la columna de SERIES desde Excel (Ctrl+C).' -ForegroundColor Yellow
  exit 1
}
Set-Content -Path $out -Value $content -Encoding utf8
Write-Host "OK -> $out ($((($content -split `"`r?`n`").Count)) lineas clipboard)" -ForegroundColor Green
Write-Host 'Siguiente:'
Write-Host '  npm run ops:serial-salida -- --file=dist/series-salida-raw.txt --guide=TC-INV-2026-XXXX'
