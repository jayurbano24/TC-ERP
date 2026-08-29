-- 221: Bodega SCRAPS — assigned_operator = creador de caja (no received_by PX).
-- Backfill desde erp_audit_logs action = CAJA SCRAPS CREADA.

UPDATE public.boxes b
SET assigned_operator_id = a.user_id
FROM (
  SELECT DISTINCT ON (record_id)
    record_id AS box_id,
    user_id
  FROM public.erp_audit_logs
  WHERE action = 'CAJA SCRAPS CREADA'
    AND user_id IS NOT NULL
    AND record_id IS NOT NULL
  ORDER BY record_id, created_at ASC
) a
WHERE b.id::text = a.box_id
  AND (
    b.rack_location = 'SCRAP'
    OR b.rack_location = 'SCRAPS'
    OR b.rack_location ILIKE 'SCRAP%'
  )
  AND b.assigned_operator_id IS NULL
  AND a.user_id IS NOT NULL;

-- Fallback: primer INGRESO BODEGA SCRAPS por box_id en new_values
UPDATE public.boxes b
SET assigned_operator_id = x.user_id
FROM (
  SELECT DISTINCT ON ((new_values->>'box_id'))
    (new_values->>'box_id') AS box_id,
    user_id
  FROM public.erp_audit_logs
  WHERE action = 'INGRESO BODEGA SCRAPS'
    AND user_id IS NOT NULL
    AND new_values ? 'box_id'
  ORDER BY (new_values->>'box_id'), created_at ASC
) x
WHERE b.id::text = x.box_id
  AND (
    b.rack_location = 'SCRAP'
    OR b.rack_location = 'SCRAPS'
    OR b.rack_location ILIKE 'SCRAP%'
  )
  AND b.assigned_operator_id IS NULL
  AND x.user_id IS NOT NULL;
