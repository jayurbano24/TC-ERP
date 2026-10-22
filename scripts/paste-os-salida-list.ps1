# Pega la columna de OS desde el portapapeles (Excel → Ctrl+C) a dist/os-salida-list.txt
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'dist\os-salida-list.txt'

function Get-OsNumberFromLine {
  param([string]$Line)
  $t = $Line.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { return $null }
  if ($t -match '(?i)(npm|powershell|\bcd\b|run ops:os-salida)') { return $null }

  if ($t -match '(?i)TC[-\s]?0*(\d{3,7})') {
    return $matches[1]
  }
  if ($t -match '^\d{4,7}$') {
    return $t
  }
  if ($t -match '\b(\d{4,7})\b') {
    return $matches[1]
  }
  return $null
}

$content = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($content)) {
  Write-Host 'Portapapeles vacío. En Excel: seleccione la columna de OS y Ctrl+C (no copie la consola).' -ForegroundColor Yellow
  exit 1
}

$rawLines = ($content -split "`r?`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
$osNumbers = [System.Collections.Generic.HashSet[string]]::new()
foreach ($line in $rawLines) {
  $n = Get-OsNumberFromLine -Line $line
  if ($null -ne $n) { [void]$osNumbers.Add($n) }
}

if ($osNumbers.Count -eq 0) {
  Write-Host 'No se encontraron numeros de OS en el portapapeles.' -ForegroundColor Red
  Write-Host 'Copio la consola por error? Vaya a Excel, clic en la letra de la columna OS, Ctrl+C, y vuelva a ejecutar.'
  Write-Host 'Primeras lineas del portapapeles:'
  $rawLines | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" }
  exit 1
}

$sorted = $osNumbers | Sort-Object { [int]$_ }
$header = "# Pegado desde portapapeles $(Get-Date -Format 'yyyy-MM-dd HH:mm') · $($sorted.Count) OS"
$body = ($sorted -join "`n")
Set-Content -Path $out -Value ($header + "`n" + $body) -Encoding utf8

Write-Host "OK: $($sorted.Count) OS -> $out" -ForegroundColor Green
Write-Host 'Primeras OS:'
$sorted | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" }
