# TC-ERP — Gate de Compatibilidad Supabase (Fase 1)

**Fecha:** 2026-10-29  
**Actualización remediación SQL + reopen:** 2026-10-29  
**Roles:** Principal PostgreSQL Engineer · Supabase Database Architect · Database Migration Specialist · QA  
**Alcance:** Bootstrap aislado `tc-erp-isolated-verify` + compatibilidad `workshop_operate_batch_tx` con Auth / PostgREST / JWT reales  
**Estado del gate:** **PASS** (aislamiento verify únicamente)

---

## 1. Resumen ejecutivo

Se corrigió la cadena de migraciones que impedía reconstruir Supabase desde cero, se reconstruyó exclusivamente `tc-erp-isolated-verify` (API **54331** / DB **54332**), y se reabrió el gate con JWT GoTrue + PostgREST + G1–G4.

| Fase | Resultado |
| :--- | :---: |
| Docker Desktop / engine | **PASS** |
| Assert destino aislado (no prod) | **PASS** |
| Remediación `normalize_equipment_serial` | **PASS** (puente `20261022180000`) |
| Puente colateral `part_harvest_sessions` | **PASS** (`20261023175802`) |
| `supabase:isolated:reset` completo (310 migraciones) | **PASS** |
| Firma + muestras `normalize_equipment_serial(text)` | **PASS** |
| GoTrue / PostgREST / JWT reales | **PASS** |
| G2 AuthZ / G1 / G3 / G4 | **PASS** (17/17) |
| Cast `series_status` en 289 (incompatibilidad demostrada) | **PASS** (fix mínimo) |
| Migraciones / deploy / merge / Fase 2 productivos | **No ejecutados** |

**Dictamen de compatibilidad:** **PASS** en entorno aislado. **No** implica apply a producción ni merge a `main`.

---

## 2. Causa raíz confirmada (`normalize_equipment_serial`)

### 2.1 Hallazgo

Orden léxico de migraciones vs. orden semántico:

| Migración | Orden | Rol |
| :--- | :---: | :--- |
| `097_*` (histórica) | Antes | Define `public.normalize_serial(text)` |
| `20261022180000_ensure_normalize_equipment_serial.sql` | **Puente nuevo** | Define alias temprano |
| `20261022181131_*`, `20261022184507_*`, `20261022185812_*` | Tras puente | **Consumen** `normalize_equipment_serial` |
| `273_classify_equipment_batch_identity_final.sql` | Después (numérico) | **Primera definición canónica histórica** |
| `274_*` | Después | Reafirma definición canónica |

En **producción / bases ya evolucionadas**, la función existía cuando se añadieron los fixes `20261022*`.  
En **reset limpio**, `20261022184507_fix_series_active_service_order_main_serial_lookup.sql` ejecutaba:

```sql
SET main_serial_normalized = public.normalize_equipment_serial(so.main_serial)
```

antes de 273 → **SQLSTATE 42883** (`function does not exist`).

### 2.2 Evidencia de investigación

- Definición original versionada: `273` / reapply `274` — cuerpo idéntico:
  - `CREATE OR REPLACE FUNCTION public.normalize_equipment_serial(p_serial text) … SELECT public.normalize_serial(p_serial);`
  - `IMMUTABLE`, `PARALLEL SAFE`, `search_path = public`
- Dependencia: `public.normalize_serial(text)` (migración 097)
- Consumidores previos a 273: migraciones timestamp `20261022*`, índice `idx_so_main_serial_equipment_normalized`, RPCs/vistas classify
- Uso TS: tests integración recepción (`seriesActiveServiceOrder*`, `classifyEquipmentSharedSerial*`) — llaman la RPC SQL, no reimplementan
- No se inventó semántica por el nombre: se copió el cuerpo canónico de 273/274

### 2.3 Dependencia colateral descubierta en el mismo reset

`20261023175803_part_harvest_cases.sql` hace `ALTER` sobre `part_harvest_sessions` **antes** de `271_part_harvest_from_scrap.sql` (CREATE). Mismo patrón “fix timestamp vs. CREATE numérico”.  
Puente: `20261023175802_ensure_part_harvest_sessions.sql` (`CREATE TABLE IF NOT EXISTS` alineado al núcleo de 271).

---

## 3. Corrección implementada

### 3.1 Estrategia elegida

**Migraciones de compatibilidad aditivas** (no reescritura silenciosa de historia ya aplicada en otros entornos):

1. `supabase/migrations/20261022180000_ensure_normalize_equipment_serial.sql`  
   - Timestamp entre `20261020001356` y `20261022181131`  
   - `CREATE OR REPLACE` idempotente = alias de `normalize_serial`  
   - 273/274 siguen siendo SSOT canónica posterior (misma semántica)
2. `supabase/migrations/20261023175802_ensure_part_harvest_sessions.sql`  
   - Antes de `20261023175803`  
   - `CREATE TABLE IF NOT EXISTS` + índices IF NOT EXISTS

### 3.2 Incompatibilidad 289 demostrada en PostgREST (excepción autorizada)

Harness efímero usaba `series.current_status text`. En Supabase real la columna es enum `series_status`.  
Transiciones exitosas fallaban con:

```text
column "current_status" is of type series_status but expression is of type text
```

**Cast obligatorio** en `289_workshop_operate_batch_tx.sql` (patrón `089_fix_workshop_rpc_enum_cast.sql`):

```sql
current_status = v_next_status::public.series_status,
```

**Nota de trazabilidad (Antigravity):** `289_workshop_operate_batch_tx.sql` es un **archivo de migración nuevo completo** en git (RPC Fase 1 + remediaciones G2/G4 + cast enum). No es un diff de una sola línea sobre un blob ya versionado en `HEAD` previo. El cast es el único ajuste post-gate frente a enum real; el resto del cuerpo es la RPC de Fase 1.

Sin cambio de reglas de negocio G1–G4, auth, ni idempotencia respecto al diseño Fase 1 aprobado en código.

### 3.3 Diff (archivos tocados en esta remediación)

| Archivo | Cambio |
| :--- | :--- |
| `supabase/migrations/20261022180000_ensure_normalize_equipment_serial.sql` | **Nuevo** — puente función |
| `supabase/migrations/20261023175802_ensure_part_harvest_sessions.sql` | **Nuevo** — puente tabla |
| `supabase/migrations/289_workshop_operate_batch_tx.sql` | **Nuevo** — RPC completa + cast `series_status` |
| `scripts/workshop-operate-supabase-gate.mjs` | **Nuevo** — batería JWT/G1–G4 aislada |
| `docs/audits/TC-ERP-PHASE-1-SUPABASE-GATE.md` | Este documento |

**No editadas** migraciones históricas `20261022184507`, `273`, `274`, `271`.

---

## 4. Resultado del reset aislado

| Ítem | Valor |
| :--- | :--- |
| Destino | `tc-erp-isolated-verify` only |
| Workdir | `.supabase-isolated-work` |
| Comando | `npm run supabase:isolated:reset` |
| Log (post-cast) | `.tmp-iso-db-reset-after-cast.log` |
| Resultado | **Finished supabase db reset** — EXIT **0** |
| Migraciones aplicadas | **310** (`schema_migrations`) |
| Puente normalize | Applying `20261022180000_…` **antes** de `20261022184507_…` |
| 289 | Applying `289_workshop_operate_batch_tx.sql` OK; cuerpo contiene `v_next_status::public.series_status` |
| Prod `gpvocfptmsskgfpacadl` | **No usado** |
| `db push` / Vercel / merge `main` | **No** |

---

## 5. Verificación de función y series

| Check | Resultado |
| :--- | :--- |
| Firma | `normalize_equipment_serial(p_serial text)` — **1** oid (sin duplicados) |
| Volatilidad | `IMMUTABLE` (`provolatile = i`) |
| Alias | `normalize_equipment_serial(x) = normalize_serial(x)` |
| Muestras | `'abc'→ABC`, `'  AB-12 '→AB-12`, `''→null/empty`, `'sn 001'→SN001` |
| Índice dependiente | `idx_so_main_serial_equipment_normalized` presente |

---

## 6. Evidencia Gate Fase 1 (JWT / PostgREST / G1–G4)

Script: `scripts/workshop-operate-supabase-gate.mjs`  
Env: `ISOLATED_SUPABASE_*` → `http://127.0.0.1:54331` + keys de `supabase status --workdir .supabase-isolated-work`  
Log: `.tmp-iso-gate-tests-post-reset.log`

| # | Caso | Resultado |
| :---: | :--- | :---: |
| — | GoTrue create + login | **PASS** |
| — | PostgREST RPC con JWT usuario | **PASS** |
| G2 | Spoof `operator_id` | **PASS** (`FORBIDDEN: operator_id…`) |
| G2 | Anónimo | **PASS** (`permission denied for function`) |
| G2 | Usuario sin rol | **PASS** (`FORBIDDEN: insufficient role`) |
| G2 | `service_role` mutate | **PASS** (`permission denied`) |
| G1 | reacondicionado-only | **PASS** |
| G1 | mixed / empty outcomes | **PASS** (`TRANSITION_NOT_ALLOWED`) |
| G1 | repair mapping inválido | **PASS** |
| G3 | transición + audit | **PASS** |
| G3 | lote inválido sin parcial | **PASS** |
| G3 | fallo audit → rollback (`FORCED_AUDIT_FAIL`) | **PASS** |
| G4 | retry idempotente | **PASS** |
| G4 | mismo key / payload distinto | **PASS** |
| G4 | segundo operador CONFLICT | **PASS** |
| — | EXECUTE solo `authenticated` (no anon/PUBLIC) | **PASS** |

**SUMMARY: total 17, pass 17, fail 0** — `GATE_EXIT=0` tras reset limpio post-cast.

GoTrue health: `{"name":"GoTrue",…}` en `/auth/v1/health`.  
PostgREST: HTTP 200 en `/rest/v1/`.

---

## 7. Permisos efectivos (medidos)

| Grantee | EXECUTE `workshop_operate_batch_tx` |
| :--- | :---: |
| `authenticated` | **Sí** |
| `anon` | **No** |
| `service_role` | **No** (REVOKE + rechazo JWT role) |
| `PUBLIC` | **No** |

---

## 8. Riesgos residuales

1. **Prod no recibe** puentes ni 289 hasta apply autorizado — gate PASS ≠ deploy.  
2. Bases que ya tenían la función no cambian semántica (`CREATE OR REPLACE` idempotente / misma expresión).  
3. Harness PG efímero (`current_status text`) **enmascara** el bug de enum; el gate Supabase es la prueba de verdad tipada.  
4. Coexistencia `tc-erp-local` en la misma máquina — no usado como sustituto.  
5. Integración Vitest recepción (`test:classify:fullstack`) no re-ejecutada en este ciclo; cobertura serial vía SQL + reset completo.  
6. CLI Supabase local `v2.109.1` (aviso de update) — no bloqueante.

---

## 9. Dictamen

# **PASS** (aislamiento `tc-erp-isolated-verify`)

| Decisión | Valor |
| :--- | :--- |
| Compatibilidad Supabase Fase 1 | **PASS** |
| Bootstrap desde cero | **PASS** (puentes + 310 migraciones) |
| Apply 289 / Vercel / merge `main` / Fase 2 | **Aún prohibido** sin autorización explícita post-revisión |
| Listo para | Revisión independiente **Antigravity** |

### Restricciones respetadas

- Sin producción, sin `db push` prod, sin deploy Vercel, sin merge `main`, sin Fase 2.  
- 289 modificado **solo** por incompatibilidad enum demostrada en runtime aislado.

**Fin — entregable para revisión independiente. Sin cambios a producción.**
