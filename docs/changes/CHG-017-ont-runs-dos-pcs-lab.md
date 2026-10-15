# CHG-017 — PDF ont_runs incompleto (2 PCs / LAB-002 vs LAB-005)

## Síntoma

PDF tipo **EMTA / DOCSIS** con solo 2 filas (Marca/Modelo, Tecnología), **SN vacío**, conteo `0 Sí · 0 No · 2 N/A`, **REPROBADO**.

Ejemplo: `LAB-005-TC-0010`, Hitron CG-2200.

## Causa raíz (no es “bug de impresión” del ERP)

1. **El ERP solo lee** `ont_runs.report_json` (y columnas planas). No ejecuta el certificador ni re-scrapea el CPE.
2. **LAB-005** (una o ambas PCs) está guardando un **payload mínimo**: sin `certificate_sheet.rows` con criterios **Esperado**, sin `serial`, sin `dut.ds_rows` / `flows`.
3. El ERP **sintetiza** un `certificate_sheet` para usar el mismo layout que LAB-002, pero **no puede inventar** umbrales DOCSIS ni canales RF que nunca llegaron en JSON.
4. **Dos computadoras** pueden empeorar el caso:
   - Inserts **duplicados** mismo `run_id` (sync repetido).
   - Versiones distintas del certificador (una PC envía JSON completo, otra envía stub).
   - Antes, `GET /api/v1/ont-runs/:runId` usaba `.maybeSingle()` → error o fila aleatoria si hay duplicados.

## Qué hacer en operación

1. Ejecutar en **Supabase SQL Editor**:
   `web/supabase/scripts/diagnose_ont_runs_lab_stations.sql`
2. Comparar `avg_json_bytes`, `sheet_con_5plus_filas` y `con_serial_*` entre **LAB-002** y **LAB-005**.
3. En las PCs de LAB-005: **misma versión/build** del certificador que LAB-002; verificar que el sync incluya `report_json.certificate_sheet` + `dut` + `flows`.
4. Si hay filas duplicadas por `run_id`, conservar la de mayor `octet_length(report_json)` y eliminar stubs (manual, tras backup).

## Cambios en código (TC-ERP)

- `assessOntRunReportQuality` + aviso en detalle ont-runs.
- `collectEmtaRowsFromRun` + copia `ds_rows` / `us_rows` / `rf_chart` al sheet.
- `fetchOntRunByRunId` elige la fila más completa ante duplicados.
- Disclaimer en PDF EMTA cuando el sheet sigue vacío.
