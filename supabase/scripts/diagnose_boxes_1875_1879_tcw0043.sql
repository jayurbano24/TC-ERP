-- =============================================================================
-- Diagnóstico: BOX-1875..1879 + DOC SAP TCW0043 (aparecen sin series)
-- Supabase → SQL Editor → Run (todas las queries)
-- =============================================================================

-- A) Cajas y conteo live de series (current_box_id)
WITH target AS (
  SELECT id, box_code, rack_location, status, capacity, is_partial_box, created_at
  FROM public.boxes
  WHERE regexp_replace(upper(btrim(box_code)), '\s+', '', 'g') IN (
    'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
  )
)
SELECT
  t.box_code,
  t.id AS box_id,
  t.rack_location,
  t.status,
  t.capacity,
  t.is_partial_box,
  count(s.id) AS series_en_caja,
  count(DISTINCT s.service_order_id) AS os_en_caja
FROM target t
LEFT JOIN public.series s ON s.current_box_id = t.id
GROUP BY t.box_code, t.id, t.rack_location, t.status, t.capacity, t.is_partial_box
ORDER BY t.box_code;

-- B) Doc SAP TCW0043
SELECT
  id,
  sap_document_number,
  status,
  created_at
FROM public.sap_transfer_documents
WHERE sap_document_number ILIKE '%TCW0043%'
   OR sap_document_number ILIKE '%TCW-0043%'
ORDER BY created_at DESC;

-- C) Series ligadas al doc SAP (aunque ya no estén en esas cajas)
WITH docs AS (
  SELECT id, sap_document_number
  FROM public.sap_transfer_documents
  WHERE sap_document_number ILIKE '%TCW0043%'
)
SELECT
  d.sap_document_number,
  s.serial_number,
  s.current_status::text AS status,
  s.current_box_id,
  b.box_code AS caja_actual,
  so.os_label,
  s.updated_at
FROM docs d
JOIN public.series s ON s.sap_transfer_id = d.id
LEFT JOIN public.boxes b ON b.id = s.current_box_id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
ORDER BY b.box_code NULLS LAST, s.serial_number
LIMIT 500;

-- D) Movimientos de bodega de esas cajas (si hubo vaciado)
WITH target AS (
  SELECT id, box_code
  FROM public.boxes
  WHERE regexp_replace(upper(btrim(box_code)), '\s+', '', 'g') IN (
    'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
  )
)
SELECT
  t.box_code,
  wm.movement_type,
  wm.series_count,
  wm.performed_by_name,
  wm.created_at,
  wm.notes
FROM target t
JOIN public.warehouse_movements wm ON wm.box_id = t.id
ORDER BY wm.created_at DESC
LIMIT 100;

-- E) Auditoría reciente mencionando las cajas / doc
SELECT
  action,
  module,
  record_id,
  created_at,
  left(coalesce(new_values::text, ''), 300) AS new_values_preview
FROM public.erp_audit_logs
WHERE created_at >= now() - interval '60 days'
  AND (
    new_values::text ILIKE '%BOX-1875%'
    OR new_values::text ILIKE '%BOX-1876%'
    OR new_values::text ILIKE '%BOX-1877%'
    OR new_values::text ILIKE '%BOX-1878%'
    OR new_values::text ILIKE '%BOX-1879%'
    OR new_values::text ILIKE '%TCW0043%'
  )
ORDER BY created_at DESC
LIMIT 80;
