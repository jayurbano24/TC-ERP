-- 193: TCW-BOX-1321 — capacity 40 pero caja cerrada con 20 → alinear a 20 (completa, no parcial).
-- Ejecutar en SQL Editor y Ctrl+F5 en Bodega.

DO $$
DECLARE
  v_box_id uuid;
  v_code text;
  v_old_cap integer;
  v_os integer;
BEGIN
  SELECT b.id, b.box_code, b.capacity
  INTO v_box_id, v_code, v_old_cap
  FROM public.boxes b
  WHERE upper(btrim(b.box_code)) IN ('BOX-1321', 'TCW-BOX-1321')
     OR regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1321'
  ORDER BY b.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION '193: no se encontró BOX-1321';
  END IF;

  SELECT count(DISTINCT coalesce(s.service_order_id, s.id))::integer
  INTO v_os
  FROM public.series s
  WHERE s.current_box_id = v_box_id
    AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

  IF coalesce(v_os, 0) <> 20 THEN
    RAISE WARNING '193: % tiene % equipos en bodega (esperado 20). Ajustando capacity a 20 igualmente.', v_code, v_os;
  END IF;

  UPDATE public.boxes
  SET
    capacity = 20,
    declared_quantity = 20,
    declared_quantity_original = coalesce(declared_quantity_original, v_old_cap, 40),
    is_partial_box = false,
    partial_box_reason = NULL,
    quantity_adjustment_reason = coalesce(
      quantity_adjustment_reason,
      '193: capacity alineada a 20 (cierre real vs declarado 40)'
    )
  WHERE id = v_box_id;

  -- No llamar warehouse_sync_box_capacity aquí: con 0 series en estatus bodega
  -- dejaría capacity=0 y la caja seguiría como parcial (20/40 declarado).

  RAISE NOTICE '193 OK: % capacity % → 20 (equipos_bodega=%)', v_code, v_old_cap, v_os;
END;
$$;

SELECT
  b.box_code,
  b.capacity,
  b.declared_quantity,
  b.declared_quantity_original,
  b.is_partial_box,
  (
    SELECT count(DISTINCT coalesce(s.service_order_id, s.id))
    FROM public.series s
    WHERE s.current_box_id = b.id
      AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  ) AS equipos_bodega,
  CASE
    WHEN (
      SELECT count(DISTINCT coalesce(s.service_order_id, s.id))
      FROM public.series s
      WHERE s.current_box_id = b.id
        AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
    ) >= coalesce(nullif(b.capacity, 0), 1)
    THEN 'completa'
    ELSE 'parcial'
  END AS fill_status
FROM public.boxes b
WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1321';

NOTIFY pgrst, 'reload schema';
