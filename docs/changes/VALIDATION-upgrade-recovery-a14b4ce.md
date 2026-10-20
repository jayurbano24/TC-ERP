# Paquete Codex — validación upgrade y recuperación → `a14b4ce`

| Campo | Valor |
|-------|--------|
| **Commit aplicación (aprobado)** | `a14b4ce22a6d53514fd69392c3b32e7016d00e5e` |
| **Versión paquete validación** | `2.1.0-codex` (`validation-package-meta.json`) |
| **Manifiesto SHA-256** | `docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json` (alcance: `PACKAGE-FILE-LIST.json`, sin autorreferencia) |

**Upgrade / recuperación:** **BLOQUEADOS** hasta copia autorizada y ensayo ejecutado.  
**Instalación limpia + classify + auth (verify):** **APROBADOS** — evidencia en `SNAPSHOT-CODEX-2026-10-20.md` (no mezclar con 54342).

---

## Matriz PREPARADO vs EJECUTADO

| Paso | Estado |
|------|--------|
| Scripts, SQL gates, plan migraciones, comparador, manifiesto | **PREPARADO** |
| Pruebas automatizadas `test:upgrade:package` | **PREPARADO** (no destructivas) |
| Restore / migrate / checks / recovery / tests 54342 | **NO EJECUTADO** (sin copia) |
| Sign-off upgrade/recuperación | **BLOQUEADO** |

---

## 1. Aislamiento obligatorio

| Instancia | DB | API | `project_id` |
|-----------|-----|-----|----------------|
| Protegida | 54322 | 54321 | `tc-erp-local` |
| Verify (evidencia aprobada aparte) | 54332 | 54331 | `tc-erp-isolated-verify` |
| **Upgrade/recovery** | **54342** | **54341** | `tc-erp-isolated-upgrade` |

- **Conexiones:** solo vía `scripts/upgrade/resolve-upgrade-target.ps1` → `UPGRADE_*` (+ alias `CLASSIFY_*` / `ISOLATED_*` **derivados del mismo status**, nunca 54322/54332).
- **Aborta si:** falta `UPGRADE_DATABASE_URL`, URLs discordantes, puertos prohibidos, o `UPGRADE_STACK_MODE≠1`.
- **Modo upgrade:** prohibido esquema mínimo efímero y omitir pruebas por config ausente.
- **Evidencia 54342:** solo `classifyEquipmentHttpAuth` + `classifyEquipmentSharedSerial` (`validation-package-meta.json`).
- **Auxiliares efímeros (NO evidencia 54342):** RepairPath, codeSequenceBootstrap, adapter RPC mock.

---

## 2. Plan real de migraciones

1. Exportar historial restaurado → JSON (`versions[]` desde `supabase_migrations.schema_migrations`).
2. `npm run supabase:upgrade:plan -- docs/.../restored-history.json`
3. **Pendientes** = archivos en `supabase/migrations/` (target `a14b4ce`) − historial.
4. Cada pendiente requiere entrada en `migration-decisions.json` (`apply` | `skip_*` | `compensatory_manual` | `block`).
5. **014 / 109900:** `block` hasta revisión de copia (cambiar decisión explícita; **no** editar `schema_migrations`).
6. **SQL modificado en Git ya aplicado:** `skip_accept_existing` + compensatoria documentada.

---

## 3. Copia autorizada

Ver `upgrade-recovery-a14b4ce/COPY-SPEC-and-anonymization.md` + `copy-manifest.template.json`.  
Validación previa: `node scripts/upgrade/validate-backup-artifact.mjs <manifest.json>` (SHA-256, tamaño, commit objetivo).

---

## 4. Procedimiento (cuando exista copia)

```powershell
cd web
git checkout a14b4ce22a6d53514fd69392c3b32e7016d00e5e

# 1) Validar manifiesto + restaurar (sin --clean; wipe previo)
npm run supabase:upgrade:restore -- -ManifestPath "D:\secure\copy-manifest.json" -StartStack

# 2) Exportar historial → restored-history.json ; revisar plan
npm run supabase:upgrade:plan -- D:\secure\restored-history.json

# 3) Evidencia before (inmutable)
npm run supabase:upgrade:checks -- -Phase before

# 4) Upgrade incremental
npm run supabase:upgrade:migrate -- -RestoredMigrationHistoryJson D:\secure\restored-history.json

# 5) Evidencia after + compare
npm run supabase:upgrade:checks -- -Phase after

# 6) Pruebas 54342
npm run supabase:upgrade:test

# 7) Recovery (wipe + restore pre-upgrade; NO sobrescribe after.json)
npm run supabase:upgrade:recovery -- -PreUpgradeManifestPath "D:\secure\copy-manifest.json"
npm run supabase:upgrade:checks -- -Phase recovered
```

**Recovery:** volumen upgrade vacío (`supabase:upgrade:wipe`) + `pg_restore` **sin** `--clean`. Residuos: gate `10_residual_objects_after_recovery.sql`. Equivalencia: `compare-evidence.mjs` (`recovered` ≡ `before`).

---

## 5. Consultas y gates

| SQL | Rol |
|-----|-----|
| `01_schema_migrations_inventory.sql` | Inventario |
| `02_counts_and_relationships.sql` | Conteos (`unlinked_at` en ciclos) |
| `03_constraints_routines_permissions.sql` | Funciones / triggers / GRANT |
| `04_classify_sentinel_queries.sql` | Centinelas identidad |
| `05_auth_rbac_inventory.sql` | RLS / RBAC |
| `09_gates_invariants.sql` | **Falla** ante invariantes nuevas |
| `10_residual_objects_after_recovery.sql` | Post-recovery |

Fingerprints JSON: `scripts/upgrade/export-evidence.mjs` → `artifacts/.../evidence/{before,after,recovered}.json`  
Comparación: `expected-after-deltas.json` + `pre-existing-anomalies.json` (opcional, anomalías preexistentes registradas).

---

## 6. Entrega reproducible

```powershell
npm run supabase:upgrade:manifest
npm run supabase:upgrade:validate-package-index
npm run test:upgrade:package
```

- Export limpio: `validate-upgrade-package-from-git-index.ps1` (sin working tree prestado).
- Dumps reales: fuera de Git (`*.dump` ignorado; fixtures bajo `fixtures/` permitidos).

---

## 7. Índice de archivos

Ver `PACKAGE-FILE-LIST.json` y manifiesto generado.
