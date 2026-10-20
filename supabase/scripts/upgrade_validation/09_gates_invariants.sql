-- Gates: fallo explícito ante invariantes nuevas (anomalías preexistentes van en pre-existing-anomalies.json).
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_shared bigint;
  v_dup_cycles bigint;
  v_orphan_series bigint;
  v_orphan_cycles bigint;
BEGIN
  SELECT COUNT(*) INTO v_shared
  FROM (
    SELECT upper(trim(s.serial_number)) AS sn
    FROM public.series s
    JOIN public.service_orders so ON so.id = s.service_order_id
    WHERE so.closed_at IS NULL
    GROUP BY 1
    HAVING COUNT(DISTINCT so.main_serial) > 1
  ) t;

  IF v_shared > 0 THEN
    RAISE EXCEPTION 'GATE shared_serial_multiple_main_serial_open_os=% (identity/classify regression)', v_shared;
  END IF;

  SELECT COUNT(*) INTO v_dup_cycles
  FROM (
    SELECT serial_number, service_order_id
    FROM public.service_order_serial_cycles
    WHERE unlinked_at IS NULL
    GROUP BY serial_number, service_order_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_dup_cycles > 0 THEN
    RAISE EXCEPTION 'GATE duplicate_open_serial_cycles=%', v_dup_cycles;
  END IF;

  SELECT COUNT(*) INTO v_orphan_series
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = s.service_order_id);

  IF v_orphan_series > 0 THEN
    RAISE EXCEPTION 'GATE orphan_series_fk=%', v_orphan_series;
  END IF;

  SELECT COUNT(*) INTO v_orphan_cycles
  FROM public.service_order_serial_cycles c
  WHERE NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = c.service_order_id);

  IF v_orphan_cycles > 0 THEN
    RAISE EXCEPTION 'GATE orphan_cycles_fk=%', v_orphan_cycles;
  END IF;
END $$;
