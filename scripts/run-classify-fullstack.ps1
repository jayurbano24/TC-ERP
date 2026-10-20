$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workdir = Join-Path $root '.supabase-isolated-work'
& (Join-Path $PSScriptRoot 'assert-isolated-supabase-target.ps1') -Workdir (Join-Path $root 'supabase\isolated')

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$statusRaw = (npx supabase status --workdir $workdir -o json 2>&1 | Out-String)
$ErrorActionPreference = $prevEap
$jsonStart = $statusRaw.IndexOf('{')
$jsonEnd = $statusRaw.LastIndexOf('}')
if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) {
  throw 'Isolated Supabase not running. Run npm run supabase:isolated:reset first.'
}
$status = ($statusRaw.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)
$env:CLASSIFY_FULL_DATABASE_URL = $status.DB_URL
$env:ISOLATED_SUPABASE_URL = $status.API_URL
$env:ISOLATED_SUPABASE_ANON_KEY = $status.ANON_KEY
$env:ISOLATED_SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
$env:ISOLATED_SUPABASE_JWT_SECRET = $status.JWT_SECRET

Push-Location $root
$env:CLASSIFY_TEST_ORDER = 'http-first'
npx vitest run --maxWorkers 1 `
  src/modules/recepcion/server/classifyEquipmentHttpAuth.integration.test.ts `
  src/modules/recepcion/server/codeSequenceBootstrap.integration.test.ts `
  src/modules/recepcion/server/classifyEquipmentSharedSerial.integration.test.ts `
  src/modules/recepcion/server/classifyEquipmentRepairPath.integration.test.ts `
  src/modules/sap-transfer/infrastructure/rpc/classify-equipment-batch.rpc.adapter.test.ts
$code = $LASTEXITCODE
Remove-Item Env:ISOLATED_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:ISOLATED_SUPABASE_JWT_SECRET -ErrorAction SilentlyContinue
Pop-Location
exit $code
