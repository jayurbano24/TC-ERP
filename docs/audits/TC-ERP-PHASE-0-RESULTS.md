# TC-ERP — Resultados Fase 0 (Contención crítica)

**Rama:** `audit/architecture-integrity-2026-10-29`  
**Commit inicial:** `91a1bc8af52240d338b7939e35662ed5d28e03d0`  
**Commit contención (código):** `8e573821c19f44de5082495b22a3370a68b2be2b`  
**Tip de rama (docs SHA stamp):** `7059ffa57ea5ce7e46d49a33e95d84511b23877f`  
**Alcance:** código y configuración. Sin migraciones, sin producción, sin deploy, sin merge a `main`.  
**Fecha:** 2026-10-29

---

## 1. Resumen ejecutivo

| Ítem | Resultado |
| :--- | :---: |
| Eliminar `clearAllReceptions` | **PASS** |
| Regresión anti-reintroducción | **PASS** |
| Blindar `test:unit` | **PASS** |
| Guardas fail-closed Supabase | **PASS** |
| Centralizar Bodega→Taller vía API | **PASS** |
| No tocar `current_status` / CHECK | **PASS** (sin cambios) |
| `npm run test:unit` | **PASS** (517 tests) |
| ESLint archivos nuevos Fase 0 | **PASS** |
| `npx tsc --noEmit` | **FAIL** (27 errores preexistentes; 0 en archivos nuevos Fase 0) |
| `npx next build` | **PASS** |
| Migraciones / prod / Vercel / merge | **SKIPPED** (prohibido) |

---

## 2. Commits

| | SHA |
| :--- | :--- |
| Inicial (autorización) | `91a1bc8af52240d338b7939e35662ed5d28e03d0` |
| Contención código | `8e573821c19f44de5082495b22a3370a68b2be2b` |
| Tip rama | `7059ffa57ea5ce7e46d49a33e95d84511b23877f` (+ commit docs SHA si aplica) |

---

## 3. Archivos modificados / añadidos

### Código
- `src/lib/database/receptions.ts` — eliminada `clearAllReceptions`
- `src/lib/database/receptions.safety.test.ts` — **nuevo**
- `src/lib/database/warehouse.ts` — Bodega→Taller solo API; sin RPC browser `warehouse_dispersion_tx`
- `src/lib/database/warehouse.transfer-api.test.ts` — **nuevo**
- `src/lib/api/warehouseTransfer.test.ts` — **nuevo**
- `src/shared/feature-flags/clientFlags.ts` — `isWarehouseTransferApiEnabled()` → siempre `true`
- `src/shared/testing/isolatedSupabaseGuard.ts` — **nuevo**
- `src/shared/testing/isolatedSupabaseGuard.test.ts` — **nuevo**
- `src/scripts/run-prediagnostico-backfill-apply.test.ts` — guarda fail-closed
- `src/scripts/export-prediagnostico-all.test.ts` — exige `ISOLATED_SUPABASE_*`
- `src/modules/workshop/shared/workshopDiagnosticRepairPolicy.test.ts` — tipado estricto
- `vitest.config.ts` — excluye scripts / integration
- `package.json` — `test:unit` por proyectos; script integración recepción
- `tsconfig.json` — exclude `web`, `.next`

### Documentación / reglas (contexto auditoría)
- `docs/audits/*` (Fase A + este reporte)
- `.cursor/rules/tc-erp-engineering-standards.mdc`
- `.cursor/rules/tc-erp-operational-ux.mdc`

---

## 4. Diff estadístico (staged)

```
28 files changed, ~1380 insertions(+), ~87 deletions(-)
```

Detalle completo: `git diff 91a1bc8..HEAD` en la rama.

### Diff funcional clave

**receptions.ts:** función `clearAllReceptions` eliminada por completo (delete masivo series + receptions).

**warehouse.ts:** rama `isWorkshop` llama únicamente `transferBoxesToWorkshopViaApi`; eliminado el bucle `supabase.rpc('warehouse_dispersion_tx', …)` desde el browser. Traslados no-taller conservan `warehouse_traslado_tx`.

**clientFlags.ts:** API de transferencia siempre habilitada (flag legacy ignorado).

**vitest:** `src/scripts/**`, `*.integration.test.ts`, `*Integration.test.ts` fuera de unit. Suite upgrade → `npm run test:upgrade:package`.

---

## 5. Pruebas ejecutadas

| Comando | Resultado | Notas |
| :--- | :---: | :--- |
| `npm run test:unit` | **PASS** | 123 files / 517 tests. Sin conexión a Supabase productivo. |
| `npx eslint` (archivos nuevos Fase 0) | **PASS** | Guard, tests, flags, vitest config |
| `npx eslint` receptions.ts / warehouse.ts completos | **FAIL** | `any` preexistente (no introducido en Fase 0) |
| `npx tsc --noEmit` | **FAIL** | 27 errores preexistentes (taller/parts/workshopTasks/…). Fase 0 files limpios en el filtro |
| `npx next build` | **PASS** | Build producción local OK |
| `npm run test:upgrade:package` | **SKIPPED** | Fuera de unit; fixture dump hash mismatch residual |
| Integración recepción / backfill live | **SKIPPED** | Requiere `ISOLATED_SUPABASE_*`; prod rechazado |
| Migraciones Supabase | **SKIPPED** | Prohibido |
| Deploy Vercel / merge main | **SKIPPED** | Prohibido |

---

## 6. Evidencia de aislamiento de Supabase

1. **Unit tests** no importan `getSupabaseServerClient` ni cargan `.env.local` en los casos Fase 0.  
2. `assertIsolatedSupabaseMutationAllowed`:
   - exige `ISOLATED_SUPABASE_URL` + `ISOLATED_SUPABASE_SERVICE_ROLE_KEY`;
   - rechaza host `gpvocfptmsskgfpacadl.supabase.co`;
   - **`ALLOW_LIVE_DB_MUTATION=true` no autoriza** producción (cubierto por test).  
3. Backfill apply + export integration usan la guarda; sin stack aislado fallan cerrados.  
4. Durante `npm run test:unit` no se observaron llamadas REST a Supabase (tests con mocks / puros).

---

## 7. Equivalencia Bodega→Taller

| Antes (flag OFF) | Ahora |
| :--- | :--- |
| Browser → `rpc(warehouse_dispersion_tx)` | Browser → `POST /api/v1/warehouse/transfer-to-workshop` → mismo RPC server-side |
| Auth: JWT usuario en PostgREST | Auth: `requireApiUser` + `ROLES_BODEGA_DESPACHO` + RPC `app_assert_any_role` |
| Errores: message RPC | Errores: HTTP + `results[]` por caja (stale / ALREADY_DISPERSED) |

Pruebas: `warehouseTransfer.test.ts`, `warehouse.transfer-api.test.ts`.

**No se modificó** `warehouse_dispersion_tx` ni migraciones.

---

## 8. Riesgos residuales

1. **tsc --noEmit FAIL** (27 errores) bloquea gate estricto de tipado; build Next igual pasó. Remediación tipado → fase posterior.  
2. **ESLint `any`** en `receptions.ts` / `warehouse.ts` legacy.  
3. **Traslado no-taller** sigue vía RPC browser (`warehouse_traslado_tx`) — fuera del alcance Bodega→Taller.  
4. **service_role** en operate-batch / otros endpoints — Fase F, no Fase 0.  
5. **`test:upgrade:package`** fixture `sample.dump` con SHA mismatch — no bloquea unit.  
6. Clientes con caché de bundle antiguo podrían intentar fallback hasta redeploy (no desplegado en esta fase).

---

## 9. Procedimiento de reversión

```bash
git checkout audit/architecture-integrity-2026-10-29
git revert <SHA_FASE_0>   # o reset --hard 91a1bc8 si el commit aún no se compartió
```

Archivos críticos a restaurar si revert parcial: `receptions.ts`, `warehouse.ts`, `clientFlags.ts`, `vitest.config.ts`, `package.json`.

No hay cambios de esquema DB que revertir.

---

## 10. Decisión solicitada

Fase 0 lista para **evaluación independiente**.

**No se inicia Fase 1** hasta aprobación explícita.
