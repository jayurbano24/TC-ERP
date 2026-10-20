# CHG — Identidad exacta en `classify_equipment_batch_tx` (272 + preflight exacto)

**Commit base:** `17de3d4` (main)  
**Estado Git:** cambios locales sin commit (fix classify + SAP previos en working tree).

## Causa raíz

Migración **177** reintrodujo idempotencia con condición **OR**:

- Si **cualquier** serie S1–S4 del lote encontraba OS activa y  
  `sap_transfer_id` **O** `reception_id` coincidía → **reutilizaba** esa OS.

Equipo B (`main_serial=B1X`, `all_series=[B1X, SHARED]`) encontraba OS de A vía **SHARED** en S2; misma recepción/SAP → fusionaba series en la OS de A.

Control intra-lote solo deduplicaba **main_serial**, no el resto de slots.

## Orden Supabase (lexicográfico, no numérico)

1. `177_restore_classify_active_os_guards.sql`
2. `20261020001356_classify_exact_serial_set_retry.sql`
3. `272_classify_exact_equipment_identity.sql` (corre **después** del timestamp)
4. **`273_classify_equipment_batch_identity_final.sql`** — cara pública final autocontenida (staging: aplicar al final)
5. **`274_classify_equipment_batch_tx_canonical_reapply.sql`** — reapply idempotente
6. **`275_classify_serial_cycle_close_normalize.sql`** — compensatoria trigger único + `normalize_equipment_serial` en cierre (si 273 duplicado ya aplicado)

Arnés de integración: aplica la cadena completa en ese orden (`classifyMigrationHarness.ts`).

## Normalización única

`normalize_equipment_serial()` → `normalize_serial()` (097): trim, quita control chars, colapsa espacios, `upper`. Locks, preflight, `series_active_service_order` y cierre de ciclos en **273**.

## Posiciones S2–S4

`all_series` es un **conjunto** (sin slot en BD). `series.serial_number` no guarda S2/S3/S4 posicional en recepción.

## Solución efectiva

**273** instala writer interno + preflight público + `equipment.batch_classified` con errores mergeados del preflight. No depende de que **272** haya corrido antes (DROP + CREATE).

1. **Reintento idempotente** solo por **S1** con **mismo** `reception_id` **Y** `sap_transfer_id`.
2. **Conflicto** si cualquier serie normalizada está en OS activa cuyo `main_serial` ≠ S1 del equipo.
3. **Anti-duplicado en lote** sobre **todas** las series (mapa serial → main).
4. **Locks** advisory por main y por cada serie (orden lexicográfico).
5. Un reintento exige el mismo conjunto normalizado S1–S4, además del mismo S1, recepción y SAP.
6. La transición de una serie a estado terminal cierra su ciclo abierto sin borrar historial.
7. Códigos en `errors[]`: `EQUIPMENT_IDENTITY_MISMATCH`, `PARTIAL_SERIAL_MATCH`, `BATCH_SERIAL_CROSS_EQUIPMENT`, etc.

Sin UNIQUE nuevo, sin backfill, sin tocar migraciones históricas.

## Función efectiva

| Orden | Archivo |
|-------|---------|
| Última redefine previa | `177_restore_classify_active_os_guards.sql` |
| Intermedia | `272_classify_exact_equipment_identity.sql` |
| **Vigente tras despliegue** | `20261020001356_classify_exact_serial_set_retry.sql` |

Helpers: `series_active_service_order` sigue en **177**; dominio reingreso/ciclos en **140**.

## Archivos de este fix (propios)

- `supabase/migrations/272_classify_exact_equipment_identity.sql` (nuevo)
- `supabase/migrations/20261020001356_classify_exact_serial_set_retry.sql` (nuevo, generado por CLI)
- `src/modules/recepcion/server/classifyEquipmentSharedSerial.integration.test.ts` (nuevo)

## Preexistentes en working tree (no incluir en PR de classify)

- `src/app/(erp)/integracion-sap/*`, `src/app/api/sap/*`, `src/lib/sap/*`
- `docs/TC_ERP_Mapeo_Operativo_para_Manuales.md`, `dist/`, `docs/superpowers/`

## Pruebas locales

```bash
cd web
npm test -- src/modules/recepcion/server/classifyEquipmentSharedSerial.integration.test.ts
npm test -- src/modules/recepcion/server/classifyEquipmentRepairPath.integration.test.ts
npm test -- src/modules/sap-transfer/infrastructure/rpc/classify-equipment-batch.rpc.adapter.test.ts
```

**Resultado (2026-10-19):** 28 tests — OK (PG efímero `C:\BioTime\pgsql\bin`). Suite `[focused minimal schema]` aplica stack 177→274 sobre esquema reducido; `classifyEquipmentRepairPath` reproduce 4-arg, pre-274, monolito roto y regresión 177 OR.

**Cadena Supabase CLI completa:** **BLOQUEADA** — Docker CLI 29.2 instalado, daemon no en ejecución (`dockerDesktopLinuxEngine`). Iniciar **Docker Desktop** y reintentar `supabase db reset` / migraciones en contenedor local.

**Omitido:** `tsc` completo (fallos previos en bodega/config/despacho, no relacionados).

## Consultas históricos (solo lectura — no ejecutar en prod desde aquí)

Comparación contra la identidad posicional conservada por PX. Una serie secundaria distinta de `service_orders.main_serial` es una relación 1:N normal y no constituye por sí sola una fusión:

```sql
WITH px_identity AS (
  SELECT
    e.id AS equipment_id,
    e.reception_id,
    e.promoted_service_order_id AS service_order_id,
    upper(trim(e.main_serial)) AS expected_main,
    ARRAY(
      SELECT DISTINCT upper(trim(sn))
      FROM unnest(ARRAY[e.main_serial, e.serial_s2, e.serial_s3, e.serial_s4]) AS u(sn)
      WHERE nullif(trim(sn), '') IS NOT NULL
      ORDER BY 1
    ) AS expected_series
  FROM public.px_reception_equipment e
  WHERE e.promoted_service_order_id IS NOT NULL
), current_identity AS (
  SELECT
    so.id AS service_order_id,
    upper(trim(so.main_serial)) AS actual_main,
    ARRAY(
      SELECT DISTINCT upper(trim(s.serial_number))
      FROM public.series s
      WHERE s.service_order_id = so.id
      ORDER BY 1
    ) AS actual_series
  FROM public.service_orders so
)
SELECT p.*, c.actual_main, c.actual_series
FROM px_identity p
JOIN current_identity c USING (service_order_id)
WHERE p.expected_main IS DISTINCT FROM c.actual_main
   OR p.expected_series IS DISTINCT FROM c.actual_series
ORDER BY p.reception_id, p.equipment_id;
```

Series con **más de un** ciclo abierto (anomalía):

```sql
SELECT upper(trim(serial_number)) AS sn, count(*) AS open_cycles
FROM public.service_order_serial_cycles
WHERE unlinked_at IS NULL
GROUP BY 1
HAVING count(*) > 1;
```

## Despliegue / rollback (plan, no ejecutado)

1. Staging: aplicar en orden `272_*.sql` y `20261020001356_*.sql` en una ventana acordada.
2. Smoke: clasificar dos equipos con S2 compartido en misma recepción → segundo debe fallar sin fusionar.
3. Rollback: migración compensatoria que elimina el wrapper, restaura el nombre público del escritor validado y elimina el trigger terminal nuevo. No revertir datos ni ciclos históricos.

## Riesgos / pendientes

- Aceptación parcial en lote: si el equipo A pasa antes que B en el JSON, A queda persistido y B se salta (contrato existente).
- Datos ya fusionados en prod: **no** reparados; requiere análisis operativo manual.
- UI: mensajes nuevos vía `SQLERRM` / `error`; opcional mapear `code` en `humanizeClassifyError.ts`.
