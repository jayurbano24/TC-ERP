-- 196: Cajas bodega con más equipos que capacity (ej. BOX-1403 → 15 equipos, capacity 14).
-- Alinea boxes.capacity al conteo OS en bodega (warehouse_sync_box_capacity).

DO $$
DECLARE
  r record;
  v_sync jsonb;
BEGIN
  FOR r IN
    SELECT b.id, b.box_code, b.capacity AS cap_old, cnt.equipos
    FROM public.boxes b
    INNER JOIN (
      SELECT
        s.current_box_id AS box_id,
        count(DISTINCT coalesce(s.service_order_id, s.id))::integer AS equipos
      FROM public.series s
      WHERE s.current_box_id IS NOT NULL
        AND s.current_status IN (
          'in_central_warehouse'::public.series_status,
          'in_control_warehouse'::public.series_status
        )
      GROUP BY s.current_box_id
    ) cnt ON cnt.box_id = b.id
    WHERE cnt.equipos > coalesce(nullif(b.capacity, 0), 0)
    ORDER BY b.box_code
  LOOP
    v_sync := public.warehouse_sync_box_capacity(r.id);
    RAISE NOTICE '196: % capacity % → % (equipos %, sync %)',
      r.box_code, r.cap_old, (v_sync->>'capacity'), r.equipos, v_sync;
  END LOOP;
END $$;

-- Verificación BOX-1403
SELECT
  b.box_code,
  b.capacity,
  count(DISTINCT coalesce(s.service_order_id, s.id)) AS equipos
FROM public.boxes b
LEFT JOIN public.series s
  ON s.current_box_id = b.id
  AND s.current_status IN (
    'in_central_warehouse'::public.series_status,
    'in_control_warehouse'::public.series_status
  )
WHERE regexp_replace(upper(coalesce(b.box_code, '')), '[^0-9]', '', 'g') = '1403'
GROUP BY b.id, b.box_code, b.capacity;
