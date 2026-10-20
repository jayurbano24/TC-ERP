# Añade al índice Git los artefactos del snapshot aislado (sin SAP/dist/logs).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

node scripts/assemble-erp-bootstrap-migration.mjs
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
node scripts/assemble-hr-legacy-migration.mjs
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }

$paths = @(
  '.gitattributes',
  'docs/changes/SNAPSHOT-CODEX-2026-10-20.md',
  'docs/changes/CHG-supabase-local-bootstrap.md',
  'package.json',
  'scripts/assemble-erp-bootstrap-migration.mjs',
  'scripts/assemble-hr-legacy-migration.mjs',
  'scripts/verify-bootstrap-reproducibility.mjs',
  'scripts/verify-migration-filenames.mjs',
  'scripts/assert-isolated-supabase-target.ps1',
  'scripts/supabase-isolated-reset.ps1',
  'scripts/run-classify-fullstack.ps1',
  'scripts/validate-from-git-index.ps1',
  'scripts/validate-index-full.ps1',
  'scripts/stage-codex-snapshot.ps1',
  'supabase/isolated/config.toml',
  'supabase/018_box_code_sequence.sql',
  'supabase/019_os_code_sequence.sql',
  'supabase/bootstrap_fragments',
  'supabase/hr_legacy',
  'supabase/platform_fragments',
  'supabase/migrations/014_erp_legacy_bootstrap.sql',
  'supabase/migrations/10990000000000_hr_legacy_attendance_bootstrap.sql',
  'supabase/migrations/01600000000000_activity_costs.sql',
  'supabase/migrations/01600000000001_profiles_avatar_storage.sql',
  'supabase/migrations/02850000000000_series_status_recepcionado_bodega_general.sql',
  'supabase/migrations/05390000000000_erp_rbac_hr_positions.sql',
  'supabase/scripts',
  'src/modules/recepcion/server/classifyEquipmentHttpAuth.integration.test.ts',
  'src/modules/recepcion/server/codeSequenceBootstrap.integration.test.ts',
  'src/modules/recepcion/server/classifyEquipmentSharedSerial.integration.test.ts',
  'src/modules/recepcion/server/classifyEquipmentRepairPath.integration.test.ts',
  'src/modules/recepcion/server/classifyIntegrationFixtures.ts',
  'src/modules/recepcion/server/classifyMigrationHarness.ts',
  'src/modules/recepcion/server/classifyEphemeralPostgres.ts',
  'src/modules/sap-transfer/infrastructure/rpc/classify-equipment-batch.rpc.adapter.test.ts'
)

foreach ($p in $paths) {
  if (Test-Path $p) { git add $p }
}
git add -u supabase/migrations/

git status -sb
Pop-Location
