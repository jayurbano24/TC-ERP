-- 141: Eliminar OS/series duplicadas o basura (no solo CANCELADO).
-- Precondición: migración 140 aplicada.
--
-- Borra:
--   * OS status = CANCELADO (cascarones / duplicados del saneamiento 140)
--   * serie inválida serial_number = '0'
-- Antesigna series huérfanas ligadas a esas OS (NULL service_order_id).
-- Recalcula reentry_count por historial restante.

-- ---------------------------------------------------------------------------
-- 1) Desvincular series que aún apuntan a OS CANCELADO
-- ---------------------------------------------------------------------------
UPDATE public.series s
SET
  service_order_id = NULL,
  updated_at = now()
WHERE s.service_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.service_orders so
    WHERE so.id = s.service_order_id
      AND so.status = 'CANCELADO'
  );

-- Limpiar FKs opcionales que no tienen ON DELETE CASCADE
DO $$
BEGIN
  IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
    UPDATE public.px_reception_equipment e
    SET promoted_service_order_id = NULL
    WHERE promoted_service_order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = e.promoted_service_order_id
          AND so.status = 'CANCELADO'
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accessories'
      AND column_name = 'service_order_id'
  ) THEN
    EXECUTE $q$
      UPDATE public.accessories a
      SET service_order_id = NULL
      WHERE service_order_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.service_orders so
          WHERE so.id = a.service_order_id
            AND so.status = 'CANCELADO'
        )
    $q$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Eliminar serie basura "0"
-- ---------------------------------------------------------------------------
DELETE FROM public.service_order_serial_cycles
WHERE upper(trim(serial_number)) = '0'
   OR serial_number = '0';

DELETE FROM public.series
WHERE serial_number = '0';

-- ---------------------------------------------------------------------------
-- 3) Eliminar OS CANCELADO (ciclos/tray CASCADE)
-- ---------------------------------------------------------------------------
DELETE FROM public.service_orders
WHERE status = 'CANCELADO';

-- ---------------------------------------------------------------------------
-- 4) Recalcular reentry_count del historial restante
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    so.id,
    ROW_NUMBER() OVER (
      PARTITION BY upper(trim(so.main_serial))
      ORDER BY so.created_at ASC, so.id ASC
    ) AS cycle_no
  FROM public.service_orders so
  WHERE public.is_valid_equipment_serial(so.main_serial)
)
UPDATE public.service_orders so
SET reentry_count = r.cycle_no
FROM ranked r
WHERE so.id = r.id
  AND coalesce(so.reentry_count, 0) IS DISTINCT FROM r.cycle_no;

-- OS con main_serial inválido: forzar 1
UPDATE public.service_orders
SET reentry_count = 1
WHERE NOT public.is_valid_equipment_serial(main_serial)
  AND coalesce(reentry_count, 0) IS DISTINCT FROM 1;

NOTIFY pgrst, 'reload schema';
