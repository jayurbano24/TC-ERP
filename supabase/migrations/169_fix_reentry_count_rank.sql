-- =============================================================================
-- 169 — Corregir reentry_count inflado (falsos "2° Ingreso")
-- =============================================================================
-- La 143 usaba GREATEST(..., next_equipment_reentry_count()), y esa función
-- devuelve COUNT(OS)+1. Aplicada a OS ya existentes, una sola OS quedaba como 2°.
-- SSOT: ranking por created_at dentro de la familia de series (main_serial).
-- =============================================================================

-- 1) Backfill ciclos faltantes (OS viva ↔ main_serial)
INSERT INTO public.service_order_serial_cycles (
  serial_number, service_order_id, cycle_no, linked_at, unlinked_at
)
SELECT
  so.main_serial,
  so.id,
  coalesce(so.reentry_count, 1),
  coalesce(so.created_at, now()),
  CASE
    WHEN public.service_order_status_is_closed(so.status)
      THEN coalesce(so.closed_at, so.created_at)
    WHEN EXISTS (
      SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
    ) THEN NULL
    ELSE coalesce(so.closed_at, now())
  END
FROM public.service_orders so
WHERE public.is_valid_equipment_serial(so.main_serial)
ON CONFLICT (serial_number, service_order_id) DO NOTHING;

-- Ciclos desde series actuales
INSERT INTO public.service_order_serial_cycles (
  serial_number, service_order_id, cycle_no, linked_at
)
SELECT
  s.serial_number,
  s.service_order_id,
  coalesce(so.reentry_count, 1),
  coalesce(s.created_at, now())
FROM public.series s
JOIN public.service_orders so ON so.id = s.service_order_id
WHERE s.service_order_id IS NOT NULL
  AND public.is_valid_equipment_serial(s.serial_number)
ON CONFLICT (serial_number, service_order_id) DO NOTHING;

-- 2) Recalcular reentry_count = orden real de ingresos por familia de serie
WITH family AS (
  SELECT
    so.id AS service_order_id,
    upper(trim(so.main_serial)) AS sn,
    so.created_at,
    so.id
  FROM public.service_orders so
  WHERE public.is_valid_equipment_serial(so.main_serial)

  UNION

  SELECT
    c.service_order_id,
    upper(trim(c.serial_number)) AS sn,
    so.created_at,
    so.id
  FROM public.service_order_serial_cycles c
  JOIN public.service_orders so ON so.id = c.service_order_id
  WHERE public.is_valid_equipment_serial(c.serial_number)
),
ranked AS (
  SELECT
    service_order_id,
    ROW_NUMBER() OVER (
      PARTITION BY sn
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS cycle_no
  FROM family
),
agg AS (
  SELECT service_order_id, MAX(cycle_no)::integer AS cycle_no
  FROM ranked
  GROUP BY service_order_id
)
UPDATE public.service_orders so
SET reentry_count = a.cycle_no
FROM agg a
WHERE so.id = a.service_order_id
  AND coalesce(so.reentry_count, 0) IS DISTINCT FROM a.cycle_no;

-- 3) Alinear cycle_no en tabla de ciclos
UPDATE public.service_order_serial_cycles c
SET cycle_no = coalesce(so.reentry_count, 1)
FROM public.service_orders so
WHERE c.service_order_id = so.id
  AND coalesce(c.cycle_no, 0) IS DISTINCT FROM coalesce(so.reentry_count, 1);

-- 4) Alinear bandeja CAC
UPDATE public.cac_tray_units t
SET
  reentry_count = coalesce(so.reentry_count, 1),
  updated_at = now()
FROM public.service_orders so
WHERE t.service_order_id = so.id
  AND coalesce(t.reentry_count, 0) IS DISTINCT FROM coalesce(so.reentry_count, 1);

NOTIFY pgrst, 'reload schema';
