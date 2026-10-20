# Evidencia classify sobre 54342 únicamente. Excluye pruebas efímeras/auxiliares.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'upgrade\resolve-upgrade-target.ps1')
$workdir = Join-Path $root '.supabase-isolated-upgrade-work'

$target = Get-UpgradeTargetFromWorkdir -Root $root -Workdir $workdir
Set-UpgradeEnvironmentVariables -Target $target
Assert-UpgradeEnvironmentPresent

if ($env:UPGRADE_DATABASE_URL -notmatch '54342') {
  throw 'Upgrade tests require UPGRADE_DATABASE_URL port 54342'
}

Push-Location $root
$env:CLASSIFY_TEST_ORDER = 'http-first'
npx vitest run --maxWorkers 1 `
  src/modules/recepcion/server/classifyEquipmentHttpAuth.integration.test.ts `
  src/modules/recepcion/server/classifyEquipmentSharedSerial.integration.test.ts
$code = $LASTEXITCODE
Clear-UpgradeEnvironmentVariables
Pop-Location
exit $code
