# CHG-016 — Diagnóstico de raíz (API / Postgres / despliegue)

**Alcance:** correlación de evidencia (no sumar API + Postgres como fallos duplicados).  
**Regla:** no marcar resuelto solo porque el log dejó de ruido; aplicar migraciones **256–257** en staging antes de prod.

Metodología de conteo en CSV/logs: unir por `request_id` / `audit_id` / `service_order_id` antes de agregar.

---

## 1. Coherencia código ↔ Supabase

| Síntoma | Causa comprobada (repo) | Evidencia | Corrección | Prueba | Resultado |
|--------|-------------------------|-----------|------------|--------|-----------|
| Columnas `service_orders_1.tech_id`, `measurement_key` | **No hay referencias** en `web/src` | Grep repo = 0 hits; alias PostgREST de embed mal formado o consulta ad-hoc fuera del repo | Localizar query en SQL Editor / BI; corregir select/join al contrato (`cac_tray_units.tech_id`, catálogos actuales) | Repetir consulta con columnas de `shared/constants/dbProjections.ts` | Pendiente evidencia del emisor exacto |
| Migraciones pre-diag | Código asume **251 + 253 + 255** | Rutas backfill + `cat_prediagnostico_model_items` | Scripts `apply_prediagnostico_251_253_255.sql` | `SELECT count(*) FROM cat_prediagnostico_model_items` | Usuario aplicó 251/253/255 en lab |

---

## 2. Catálogo pre-diagnóstico — GET 404 `cat_prediagnostico_model_items`

| Campo | Detalle |
|-------|---------|
| **Síntoma** | ~929 GET 404, dos `model_id`, origen Node |
| **Causa** | PostgREST **PGRST205** / relación ausente o schema cache viejo **antes** de 253; alternativa: cliente browser en configuración (`getPrediagnosticoModelItemIds`) con error tragado → reintentos UI |
| **Consumidores** | `prediagnosticoBackfillCatalog.ts` (1× por lote backfill), `GET /api/v1/backoffice/prediagnostico`, `GET /api/v1/recepcion/px/prediagnostico`, `PrediagnosticoCatalogPanel` → `fetchPrediagnosticoModelItemIds` |
| **Dos modelos** | Perfil por modelo en configuración / bandeja con pocos modelos dominantes — no implica bucle infinito en backfill (catálogo completo por lote) |
| **Corrección** | Migración 253; `NOTIFY pgrst`; dejar de devolver `[]` silencioso — `fetchPrediagnosticoModelItemIds` + toast en configuración; backfill lanza error explícito |
| **Prueba** | Tras 253: `GET .../cat_prediagnostico_model_items?model_id=eq.<uuid>` → **200** y `[]` o filas; sin 404 |
| **Resultado** | Código listo; validar en Supabase tras reload schema |

**404 vs vacío:** 404/PGRST205 = contrato roto; **200 + []** = sin perfil (válido: reglas tech/marca en `resolvePrediagnosticoCatalog`).

---

## 3. Taller — `count_workshop_os_all_tabs` 500 / refrescos

| Campo | Detalle |
|-------|---------|
| **Síntoma** | POST 500 RPC (Node + navegador) |
| **Causa** | Función **SECURITY INVOKER** (231): subquery `listo` lee `erp_audit_logs`; con JWT **authenticated** RLS deniega o timeout |
| **Callers** | `GET /api/v1/workshop/counts` (service role ✓), `workshop.ts` fallback **browser RPC** ✗, `workshopTasksService`, `syncPipelineWip` |
| **Corrección** | Migración **257** — `SECURITY DEFINER` mismo cuerpo 231 |
| **Prueba** | Sesión operador: `rpc('count_workshop_os_all_tabs')` → 200 JSON; API `/workshop/counts` estable |
| **refresh_enterprise_summary_views 500/406** | 500: wrapper 166 / función internal / refresh MV fallido — revisar cuerpo en logs (`rpcInternal`). 406: confirmar `code` (PGRST116 = 0 filas con `.single()`); ruta cron usa JSON sin `.single()` — no asumir 406 = single sin payload |
| **Acoplamiento** | `syncPipelineWip` refresca MV en cada sync — pesado; separar cron MV vs lectura interactiva (roadmap); fallback ya tolera error MV |

---

## 4. KPI — 42P10 ON CONFLICT / dedup

| Campo | Detalle |
|-------|---------|
| **Síntoma** | 319× Postgres 42P10; upsert `on_conflict=audit_id`; 85 duplicados índice dedup |
| **Causa A** | `classifyAuditMetrics` emite **≥2 métricas** por audit (QC); PK solo `audit_id` + filtro previo por `audit_id` → pierde métricas / upsert inválido |
| **Causa B** | 42P10 PostgREST: target `on_conflict` **no coincide** con UNIQUE/PK desplegado |
| **Identidad correcta** | Una fila ledger = `(audit_id, proceso, metrica, dimension_key)`; dedup parcial `(fecha, proceso, metrica, record_id)` es regla de negocio distinta |
| **Corrección** | Migración **256** PK compuesta; `syncAuditFeed` upsert `audit_id,proceso,metrica,dimension_key`; tests `kpiLedgerIdentity.test.ts` |
| **Reconciliación** | `supabase/scripts/reconcile_kpi_event_ledger_dedup.sql` |
| **Prueba** | `vitest kpiLedgerIdentity.test.ts`; sync audit feed en staging con audit QC → 2 filas ledger |
| **No hacer** | `UNIQUE(audit_id)` solo; borrar `idx_kpi_event_ledger_dedup` sin regla |

---

## 5. Auth 401 — series / erp_audit_logs paginados

| Campo | Detalle |
|-------|---------|
| **Síntoma** | 13× 401 en paginación |
| **Causa probable** | `kpiReadService` / clientes browser leen `erp_audit_logs` sin policy lectura (112 — deny intentional) o sesión expirada mid-pagination |
| **Corrección** | Lecturas KPI audit vía **service role** en server/cron; no ampliar RLS sin revisión seguridad |
| **Prueba** | Paginar audit en ruta API autenticada vs directo Supabase anon |
| **mv_workshop 403** | MV sin GRANT o cliente anon; `kpi-engine`/`syncPipelineWip` deben usar service role — warning + fallback live counts |

---

## 6. PX / cajas / ONT

| Problema | Acción |
|----------|--------|
| `finalize_px_reception_prep_one_box_tx` 400 | Correlacionar con `VERSION_CONFLICT` / `isPxVersionConflict` — doble submit, versión caja |
| `ont_runs_pkey`, `boxes_reception_id_box_code_key` | Duplicidad identidad negocio — idempotencia cliente |
| 25P02 | Buscar **primer** error en la misma transacción RPC |
| JSON / syntax | Trazar payload en `callPxFinalizeRpc` |

---

## Despliegue recomendado (staging)

1. `256_kpi_event_ledger_composite_pk.sql` (si falla: ejecutar reconcile dedup)
2. `257_count_workshop_os_security_definer.sql`
3. `NOTIFY pgrst, 'reload schema'` o reinicio PostgREST
4. Deploy app con `syncAuditFeed` + catálogo pre-diag
5. Verificar: workshop counts, KPI sync, 0× 42P10 en ledger upsert

## Sin comprobar aún

- Cuerpo exacto de cada 401/404/500 en export CSV (adjuntar `code`, `message`, `details`, `hint`)
- Correlación request_id API ↔ statement Postgres
- Plan/query de timeout en `count_workshop` pre-257 en prod
- Emisor de `measurement_key` / `service_orders_1.tech_id`
