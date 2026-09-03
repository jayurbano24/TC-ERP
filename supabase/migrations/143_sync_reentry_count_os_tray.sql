-- 143: Alinear reentry_count OS ↔ bandeja CAC.
-- Fuente de verdad: max(cycle_no en service_order_serial_cycles, next_equipment_reentry_count).
-- Evita bajar a 1° cuando el OS previa fue eliminada pero el ciclo quedó registrado.

WITH by_cycles AS (
  SELECT
    so.id AS service_order_id,
    GREATEST(
      coalesce(
        (
          SELECT MAX(c.cycle_no)
          FROM public.service_order_serial_cycles c
          WHERE c.service_order_id = so.id
             OR (
               public.is_valid_equipment_serial(so.main_serial)
               AND upper(trim(c.serial_number)) = upper(trim(so.main_serial))
             )
        ),
        1
      ),
      CASE
        WHEN public.is_valid_equipment_serial(so.main_serial)
          THEN public.next_equipment_reentry_count(ARRAY[so.main_serial])
        ELSE 1
      END
    ) AS cycle_no
  FROM public.service_orders so
  WHERE coalesce(so.os_label, '') LIKE 'TC-%'
)
UPDATE public.service_orders so
SET reentry_count = b.cycle_no
FROM by_cycles b
WHERE so.id = b.service_order_id
  AND coalesce(so.reentry_count, 0) IS DISTINCT FROM b.cycle_no;

UPDATE public.cac_tray_units t
SET
  reentry_count = coalesce(so.reentry_count, 1),
  updated_at = now()
FROM public.service_orders so
WHERE t.service_order_id = so.id
  AND coalesce(t.reentry_count, 0) IS DISTINCT FROM coalesce(so.reentry_count, 1);

NOTIFY pgrst, 'reload schema';
