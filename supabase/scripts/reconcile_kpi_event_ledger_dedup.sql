-- Reconciliación CHG-016: duplicados en idx_kpi_event_ledger_dedup (fecha, proceso, metrica, record_id)
-- Ejecutar en staging; revisar filas antes de DELETE en producción.

SELECT fecha, proceso, metrica, record_id, count(*) AS n, array_agg(audit_id ORDER BY created_at) AS audit_ids
FROM public.kpi_event_ledger
WHERE record_id IS NOT NULL AND record_id <> ''
GROUP BY fecha, proceso, metrica, record_id
HAVING count(*) > 1
ORDER BY n DESC
LIMIT 100;

-- Tras validar regla de negocio (conservar audit_id más antiguo):
-- WITH ranked AS (
--   SELECT ctid,
--          row_number() OVER (
--            PARTITION BY fecha, proceso, metrica, record_id
--            ORDER BY created_at ASC, audit_id ASC
--          ) AS rn
--   FROM public.kpi_event_ledger
--   WHERE record_id IS NOT NULL AND record_id <> ''
-- )
-- DELETE FROM public.kpi_event_ledger k
-- USING ranked r
-- WHERE k.ctid = r.ctid AND r.rn > 1;
