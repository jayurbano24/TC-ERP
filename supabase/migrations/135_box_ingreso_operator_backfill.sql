-- 135: Mejorar Usuario Ingreso en Bodega.
-- Backfill assigned_operator_id desde movimientos reales, auditoría INGRESO BODEGA
-- y receptions.received_by (uuid de perfil).

-- 1) Movimientos con performed_by real (excluye backfill "Sistema (...)")
UPDATE public.boxes b
SET assigned_operator_id = m.performed_by
FROM (
  SELECT DISTINCT ON (wm.box_id)
    wm.box_id,
    wm.performed_by
  FROM public.warehouse_movements wm
  WHERE wm.performed_by IS NOT NULL
    AND coalesce(wm.performed_by_name, '') NOT ILIKE '%backfill%'
    AND coalesce(wm.performed_by_name, '') NOT ILIKE 'Sistema (%'
    AND lower(trim(coalesce(wm.performed_by_name, ''))) NOT IN ('sistema', 'operador', 'operador_sistema')
  ORDER BY
    wm.box_id,
    CASE WHEN wm.movement_type = 'INGRESO' THEN 0 ELSE 1 END,
    wm.created_at ASC
) m
WHERE b.id = m.box_id
  AND b.assigned_operator_id IS NULL;

-- 2) Bitácora erp_audit_logs (misma fuente que Consulta → INGRESO BODEGA)
UPDATE public.boxes b
SET assigned_operator_id = a.user_id
FROM (
  SELECT DISTINCT ON (s.current_box_id)
    s.current_box_id AS box_id,
    al.user_id
  FROM public.erp_audit_logs al
  INNER JOIN public.series s ON s.id::text = al.record_id
  WHERE al.action = 'INGRESO BODEGA'
    AND al.user_id IS NOT NULL
    AND s.current_box_id IS NOT NULL
  ORDER BY s.current_box_id, al.created_at ASC
) a
WHERE b.id = a.box_id
  AND b.assigned_operator_id IS NULL;

-- 3) Recepción: received_by es uuid de profiles (no texto)
UPDATE public.boxes b
SET assigned_operator_id = r.received_by
FROM public.receptions r
WHERE b.reception_id = r.id
  AND b.assigned_operator_id IS NULL
  AND r.received_by IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = r.received_by
  );

NOTIFY pgrst, 'reload schema';
