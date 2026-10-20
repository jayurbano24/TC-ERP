# SNAPSHOT Codex — entrega autocontenida (2026-10-20)

**Identificador:** `codex-isolated-bootstrap-2026-10-20`  
**Base Git:** `17de3d4fa8aa35612902fb5d5540894c966b09e6` (sin commit en esta entrega)  
**Alcance:** solo stack **aislado**; **no** se modificó `tc-erp-local` (54322) ni bases remotas.

---

## 1. Instancias

| Instancia | `project_id` | API | DB | Config versionada |
|-----------|--------------|-----|-----|-------------------|
| **Protegida** | `tc-erp-local` | 54321 | **54322** | `supabase/config.toml` (no tocada por scripts aislados) |
| **Aislada** | `tc-erp-isolated-verify` | **54331** | **54332** | `supabase/isolated/config.toml` |

**Workdir CLI:** `.supabase-isolated-work/` (generado; copia config desde `supabase/isolated/`).  
**Validación:** `scripts/assert-isolated-supabase-target.ps1` (rechaza `project_id` local y puerto 54322 en `[db]`).

---

## 2. Ensambladores (solo lectura en verify)

| Script | Artefacto | SHA-256 committed (post-fix secuencias) |
|--------|-----------|----------------------------------------|
| `assemble-erp-bootstrap.mjs` | `014_erp_legacy_bootstrap.sql` | `4ae38652ecffae9a4c471063a45af2b6a6b102fac660abb83cd7ecc0ec7b1fd7` (LF; fuentes normalizadas en ensamblador) |
| `assemble-hr-legacy.mjs` | `10990000000000_hr_legacy_attendance_bootstrap.sql` | `f389636d0192a09e04f135c68f6e3a4f0ec277edc41f25ac6feb6792c037db62` |

- **Verificador:** `npm run supabase:verify:assemble` — ensambla **en memoria**, compara con el archivo versionado, **no escribe** migraciones. Dos pasadas consecutivas: **OK** (`diskUntouched=true`).
- **Regenerar artefactos (mantenedor):** `npm run supabase:bootstrap:assemble` y `npm run supabase:hr:assemble`.

**Hashes anteriores (pre-fix 018/019):**  
`014` → `1576f1c0…`; `109900…` → `558f7c26…`.

---

## 3. Secuencias 018 / 019

- Fuentes: `supabase/018_box_code_sequence.sql`, `supabase/019_os_code_sequence.sql`.
- **Fix:** `DO` con `v_max`; vacío → `setval(1, false)`; poblado → `setval(v_max, true)`.
- **OS:** `LPAD(..., 6, '0')` (`TC-000001`).
- **BOX bootstrap:** `BOX-{n}` sin LPAD truncante (125 sigue siendo canónico en runtime).
- **Prueba:** `codeSequenceBootstrap.integration.test.ts` (2 tests).

---

## 4. SQL omitidos por CLI — resolución

| Archivo (antes en `migrations/`) | Acción |
|----------------------------------|--------|
| `create_activity_costs_table.sql` | Promovido → `01600000000000_activity_costs.sql` |
| `create_avatars_storage.sql` | Promovido → `01600000000001_profiles_avatar_storage.sql` (+ `profiles.avatar_url`, bucket `avatars`, políticas Storage) |
| `create_erp_audit_logs.sql` | Ya en `034_erp_audit_logs.sql` → movido a `supabase/scripts/legacy_sql/` |
| `create_erp_roles_permissions.sql` | Ya en `05390000000000_erp_rbac_hr_positions.sql` → `legacy_sql/` |
| `add_emta_sap_columns.sql` | Ya en `09960000000000_series_material_sap_columns.sql` → `legacy_sql/` |
| `191b_diagnose_70dff79e_broad.sql` | `supabase/scripts/diagnostics/` (no migración) |
| `201b_repair_tc_03226_siblings_to_workshop.sql` | `supabase/scripts/repair/` (no migración) |

**Gate:** `npm run supabase:verify:migrations` + reset falla si log contiene `Skipping migration *.sql...`.

---

## 5. Comandos de evidencia (2026-10-20)

```powershell
cd C:\Users\Usuario01\TC-ERP\web
npm run supabase:verify:migrations
npm run supabase:verify:assemble
npm run supabase:verify:assemble          # 2.ª pasada
npm run supabase:isolated:reset           # exit 0; no toca 54322
npm run test:classify:fullstack           # --maxWorkers 1; PG 15.8 aislado
npx vitest run --maxWorkers 1 `
  src/modules/recepcion/server/classifyEquipmentSharedSerial.integration.test.ts `
  src/modules/recepcion/server/classifyEquipmentRepairPath.integration.test.ts `
  src/modules/sap-transfer/infrastructure/rpc/classify-equipment-batch.rpc.adapter.test.ts
```

**Export índice Git (solo lectura):** `npm run supabase:validate:index` (`git checkout-index` → verify ×2).

**Cadena Codex (índice → reset → suite):** `npm run supabase:validate:index:full` — verificado **exit 0** (2026-10-20): verify ×2 sin mutar hash, reset aislado 54332 sin migraciones omitidas, `test:classify:fullstack` 36+1.

**Orden RBAC:** `05390000000000_erp_rbac_hr_positions.sql` (antes de `054_nav_*`; el CLI ordena `054_nav` antes que `054000…`).

---

## 6. Resultados de pruebas (conteos reales)

| Suite | Conteo | Notas |
|-------|--------|-------|
| Full-stack aislado (`test:classify:fullstack`) | **36 passed, 1 skipped** | Skip: simulación `auth.uid()` stub solo en PG efímero |
| HTTP auth (GoTrue + PostgREST) | **7/7** | Sin Authorization, JWT malformado/expirado, JWT GoTrue + `domain_events`, anon, `service_role` sin bypass, RLS `activity_costs` |
| Shared serial PG15 | **20/20** (+1 skip arriba) | Esquema completo 54332 |
| Repair path (efímero) | **4/4** | |
| Adapter RPC (mock) | **3/3** | |
| Secuencias 018/019 | **2/2** | |
| Minimal (sin `CLASSIFY_FULL_DATABASE_URL`) | **28/28** | PG 10.7 efímero |

**Sustitución de prueba:** el skip full-stack de `auth.uid()` stub → **`classifyEquipmentHttpAuth.integration.test.ts`** (HTTP trazable).

---

## 7. Bloqueados (sin artefacto autorizado)

- **Upgrade** desde copia prod-like con historial `schema_migrations` + datos anonimizados.
- **Recuperación / centinela upgrade.**

---

## 8. Archivos clave (entrega)

- `supabase/isolated/config.toml`
- `scripts/assert-isolated-supabase-target.ps1`, `supabase-isolated-reset.ps1`, `verify-bootstrap-reproducibility.mjs`, `verify-migration-filenames.mjs`, `validate-from-git-index.ps1`
- `scripts/assemble-*.mjs` (export `build*`)
- `supabase/018_*.sql`, `supabase/019_*.sql`
- `supabase/migrations/01600000000000_activity_costs.sql`, `01600000000001_profiles_avatar_storage.sql`
- `supabase/scripts/{diagnostics,repair,legacy_sql}/`
- Tests: `classifyEquipmentHttpAuth.integration.test.ts`, `codeSequenceBootstrap.integration.test.ts`, fixtures cleanup ampliado

**Excluir de commit:** `.supabase-isolated-work/`, `.supabase-isolated/`, logs, `dist/`, claves de `supabase status`.

---

**Edición detenida** en este snapshot para revisión Codex independiente.
