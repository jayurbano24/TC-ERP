# Exporta PREDIAGNOSTICO_EQUIPOS (formato SCA nuevo) sin abrir el navegador.
# Requiere: Node/npm, .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
#
# Uso:
#   cd c:\Users\Usuario01\TC-ERP\web\scripts
#   .\export-prediagnostico.ps1 -Sample100
#   .\export-prediagnostico.ps1 -All
#   .\export-prediagnostico.ps1 -From 2026-01-01 -To 2026-03-31
#   .\export-prediagnostico.ps1 -All -OpenFolder

param(
  [switch]$All,
  [switch]$Sample100,
  [string]$From = '',
  [string]$To = '',
  [switch]$ExcludeBackfill,
  [switch]$OpenFolder
)

$ErrorActionPreference = 'Stop'
$WebRoot = Split-Path $PSScriptRoot -Parent
Set-Location $WebRoot

$envFile = Join-Path $WebRoot '.env.local'
if (-not (Test-Path $envFile)) {
  Write-Host 'ERROR: No existe .env.local en web\' -ForegroundColor Red
  Write-Host 'Copie las variables de Supabase (URL + SUPABASE_SERVICE_ROLE_KEY).' -ForegroundColor Yellow
  exit 1
}

if (-not $All -and -not $Sample100 -and -not $From -and -not $To) {
  Write-Host @'
Modo no indicado. Elija uno:

  .\scripts\export-prediagnostico.ps1 -Sample100     # ~1 min, 100 filas (probar formato)
  .\scripts\export-prediagnostico.ps1 -All          # ~8-15 min, todos (~80k filas)
  .\scripts\export-prediagnostico.ps1 -From 2026-01-01 -To 2026-03-31

Opcional: -ExcludeBackfill  -OpenFolder
'@ -ForegroundColor Cyan
  exit 0
}

if ($Sample100) {
  Write-Host '[prediag] Generando muestra 100 filas (formato SCA)…' -ForegroundColor Green
  npm run export:prediagnostico:sample100
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $outFile = Join-Path $WebRoot 'dist\PREDIAGNOSTICO_EQUIPOS_muestra_100.xlsx'
} elseif ($All) {
  Write-Host '[prediag] Export COMPLETO (allData). No cierre esta ventana (~8-30 min)…' -ForegroundColor Green
  Write-Host 'Cierre Excel si tiene abierto PREDIAGNOSTICO_EQUIPOS_todos.xlsx (evita error EBUSY).' -ForegroundColor Yellow
  Write-Host 'Terminó cuando aparezca:  ========== EXPORT TERMINADO ==========' -ForegroundColor Cyan
  npm run export:prediagnostico
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $outFile = Join-Path $WebRoot 'dist\PREDIAGNOSTICO_EQUIPOS_todos.xlsx'
} else {
  if (-not $From -or -not $To) {
    Write-Host 'ERROR: Con rango use -From y -To (YYYY-MM-DD).' -ForegroundColor Red
    exit 1
  }
  Write-Host "[prediag] Export rango $From → $To …" -ForegroundColor Green
  $env:PREDIAG_EXPORT_FROM = $From
  $env:PREDIAG_EXPORT_TO = $To
  if ($ExcludeBackfill) { $env:PREDIAG_EXPORT_EXCLUDE_BACKFILL = '1' }
  npx --yes tsx scripts/export-prediagnostico-range.ts
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $safeFrom = $From -replace '[^0-9-]', ''
  $safeTo = $To -replace '[^0-9-]', ''
  $outFile = Join-Path $WebRoot "dist\PREDIAGNOSTICO_EQUIPOS_${safeFrom}_a_${safeTo}.xlsx"
}

if (Test-Path $outFile) {
  Write-Host "`nListo:" -ForegroundColor Green
  Write-Host $outFile
  if ($OpenFolder) {
    explorer.exe (Split-Path $outFile -Parent)
  }
} else {
  Write-Host 'Export terminó pero no se encontró el archivo esperado en dist\' -ForegroundColor Yellow
}
