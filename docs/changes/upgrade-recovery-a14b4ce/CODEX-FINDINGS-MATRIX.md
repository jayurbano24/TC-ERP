# Matriz hallazgos Codex (commit `1e87f65` → corrección v2.2.0)

| Hallazgo | Causa | Archivo(s) | Corrección | Prueba negativa |
|----------|--------|------------|------------|-----------------|
| **1. Manifiesto y exportación** |
| Manifiesto incompleto | `PACKAGE-FILE-LIST` omitía `package.json` / lockfile | `PACKAGE-FILE-LIST.json` | Incluir dependencias npm del paquete | Verify falla si falta entrada |
| Hash ≠ bytes Git | Mezcla working tree / CRLF en export | `prepare-package-manifest.mjs`, `materialize-git-index-export.mjs`, `verify-package-manifest.mjs` | Prepare = `git show :path`; export = mismos bytes | Manifiesto alterado → reject |
| Verify reescribía manifiesto | `generate` en validador | `validate-upgrade-package-from-git-index.ps1` | Solo `verify-package-manifest.mjs` | — |
| Tests desde repo | `vitest` en `$root` | `export-git-index-package.ps1` | Tests en export + junction `node_modules` | — |
| Fixture dump hash incorrecto | Hash ≠ blob índice | `fixtures/sample.dump`, `manifest-valid.json` | SHA-256 `e4c16e…` (30 bytes índice) | `manifest-bad-sha` |
| LF/CRLF ambiguo | Sin política | `HASH-POLICY.md` | Digest sobre blob índice/export | — |
| **2. Restauración** |
| Migraciones antes de restore | Junction `migrations/` en init | `supabase-isolated-upgrade-init.ps1`, `link-upgrade-application-migrations.ps1` | Init plataforma sin app migrations | Restore no enlaza hasta post-restore |
| “Volumen nuevo” insuficiente | Solo wipe | `assert-pre-restore-database.mjs` | Gate SQL tablas app vacías/ausentes | Datos app presentes → reject |
| Multi-dump sin orden | Solo `files[0]` | `validate-backup-artifact.mjs`, `supabase-isolated-upgrade-restore.ps1` | `restoreOrder[]` obligatorio | `manifest-multi-no-order` → reject |
| **3. Plan de migraciones** |
| `skip_equivalent` + CLI | Archivo pendiente en folder | `compute-migration-plan.mjs` | Bloqueo `skip_while_pending_cli_would_apply` | Test skip fixture |
| Plan ≠ runner | `migration up` global | `run-approved-migrations.mjs`, `supabase-isolated-upgrade-migrate.ps1` | Staging solo `toApply` | Migración extra en folder → reject |
| Historial desacoplado | Plan sin snapshot | `extract-schema-migrations.mjs`, `compute-migration-plan.mjs` | `restoredVersionsKey` + `sourceBackupManifest` | Historial distinto → reject |
| Sin revalidación pre-migrate | Plan stale | `validate-plan-before-migrate.mjs` | Recompute + compare antes de up | `toApply` drift → reject |
| Target fuera del export | Scan `supabase/migrations` | `target-migration-index.json`, `sync-target-migration-index.mjs` | Lista fijada @ `a14b4ce` | Plan desde export sin índice → error |
| **4. Conservación de datos** |
| Fingerprints truncados | `LIMIT 5000/10000` | `export-evidence.mjs` | Lectura por bloques 4096 + IDs completos | Swap mismo conteo → fail |
| Diff after vago | “Es diferente” | `expected-after-deltas.json`, `compare-evidence.mjs` | Claves permitidas explícitas | Permiso no listado → fail |
| Sin secuencias/rutinas/owners | Solo tablas classify | `export-evidence.mjs`, `compare-evidence.mjs` | `sequences`, `routines_public`, `table_owners` | Cambio no aprobado → fail |
| **5. Respaldo y recuperación** |
| Backup sin `pg_restore --list` | Solo sha/size | `validate-backup-artifact.mjs` | `--list` en `pg_custom` | Formato inválido → reject |
| Anonimización auto-certificada | Boolean en JSON | `copy-manifest.template.json`, validator | `responsiblePartyAttestation` vs `automatedChecks` | `anonymizationVerified: true` → reject |
| Residual post-recovery | Solo classify | `object-inventory.mjs`, `compare-object-inventory.mjs` | Inventario pg + policies | Objeto extra → reject |
| Fases mezcladas | Recovery sobrescribe after | `RUNBOOK.md`, recovery drill | `before` / `after` / `recovered` separados | — |
| **6. Runbook** |
| Una sola referencia commit | Solo `a14b4ce` | `RUNBOOK.md`, `PACKAGE-MANIFEST.sha256.json` | Dual: app + `validationPackageCommit` | — |
| Migraciones ajenas | Checkout ambiguo | `RUNBOOK.md`, `target-migration-index.json` | Target = índice @ `a14b4ce` | — |
| **7. Validación no destructiva** |
| Manifiesto alterado | — | `upgrade-validation-package.test.mjs` | `verifyPackageManifestFromExport` | SHA drift → reject |
| Historial distinto | Plan stale | `validate-plan-before-migrate.mjs` | `restoredVersionsKey` | Test versions changed |
| Migración fuera del plan | Runner laxo | `assertRunnerMatchesPlan` | Set diff | Extra `.sql` → reject |
| Respaldo incompleto | Campos opcionales | `validate-backup-artifact.mjs` | `REQUIRED_TOP` + `files[]` | `manifest-incomplete` |
| Multi-dump no soportado | — | validator | Sin `restoreOrder` | `manifest-multi-no-order` |
| Pérdida fila (mismo conteo) | LIMIT / solo count | `compare-evidence.mjs` | Conjuntos ID | Test silent swap |
| Permisos no aprobados | — | `compare-evidence.mjs` | `grants_classify` fuera de delta | Test grants change |
| Objeto residual | — | `compareInventories` | — | Test unexpected object |
| Destino incorrecto | URL laxa | `export-evidence.mjs`, `assert-pre-restore-database.mjs` | Puertos 54322/54332 prohibidos; 54342 obligatorio | Tests 54322/54332/wrong port |

**Estado ensayo upgrade/recovery:** sigue **BLOQUEADO** (estas pruebas no sustituyen ensayo con copia autorizada).
