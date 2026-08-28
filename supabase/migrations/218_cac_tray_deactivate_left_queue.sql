-- 218: Historial CAC — desactivar OS cuya(s) serie(s) ya no están en cola Backoffice.
-- Cubre: Bodega Central, Control, Taller, QC, irreparable, despachado, devolución.
-- Ejecutar en SQL Editor tras 217. Luego Ctrl+F5 en Historial.

-- 1) Limpieza masiva: activas cuya OS ya no tiene series en cola Backoffice
UPDATE public.cac_tray_units t
SET
  is_active = false,
  excluded_reason = COALESCE(NULLIF(t.excluded_reason, ''), 'left_backoffice_queue'),
  unit_status_label = 'Fuera de cola Backoffice',
  updated_at = now()
WHERE t.is_active = true
  AND t.service_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.series s WHERE s.service_order_id = t.service_order_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.series s
    WHERE s.service_order_id = t.service_order_id
      AND lower(COALESCE(s.current_status::text, '')) IN (
        'recepcionado_bodega_general',
        'in_validation',
        'pendiente_ingreso_bodega'
      )
  );

-- 2) Ampliar RPC: desactiva si la OS ya salió de la cola Backoffice
CREATE OR REPLACE FUNCTION public.cac_tray_deactivate_if_in_warehouse(p_os_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_series boolean;
  v_still_in_queue boolean;
  v_sample_status text;
BEGIN
  IF p_os_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.series s WHERE s.service_order_id = p_os_id
  )
  INTO v_has_series;

  IF NOT v_has_series THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.series s
    WHERE s.service_order_id = p_os_id
      AND lower(COALESCE(s.current_status::text, '')) IN (
        'recepcionado_bodega_general',
        'in_validation',
        'pendiente_ingreso_bodega'
      )
  )
  INTO v_still_in_queue;

  IF v_still_in_queue THEN
    RETURN;
  END IF;

  SELECT lower(COALESCE(s.current_status::text, ''))
  INTO v_sample_status
  FROM public.series s
  WHERE s.service_order_id = p_os_id
  ORDER BY s.updated_at DESC NULLS LAST, s.id
  LIMIT 1;

  UPDATE public.cac_tray_units
  SET
    is_active = false,
    excluded_reason = COALESCE(NULLIF(excluded_reason, ''), 'left_backoffice_queue'),
    unit_status = COALESCE(NULLIF(v_sample_status, ''), unit_status),
    unit_status_label = CASE
      WHEN v_sample_status IN ('in_central_warehouse', 'ingresado_bodega')
        THEN 'Ingresado a Bodega General'
      WHEN v_sample_status IN ('returned', 'devuelto', 'devuelto_bloque', 'devuelto_cac')
        THEN 'Devuelto'
      WHEN v_sample_status IN ('dispatched', 'despachado')
        THEN 'Despachado'
      ELSE 'Fuera de cola Backoffice'
    END,
    updated_at = now()
  WHERE service_order_id = p_os_id
    AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.cac_tray_deactivate_if_in_warehouse(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cac_tray_deactivate_if_in_warehouse(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cac_tray_deactivate_if_in_warehouse(uuid) IS
  'Desactiva cac_tray_units cuando la OS ya no tiene series en cola Backoffice (bodega/taller/QC/despacho/devolución).';

-- 3) Trigger: cualquier cambio de estado de serie puede sacar la OS del Historial
CREATE OR REPLACE FUNCTION public.trg_series_deactivate_cac_tray_on_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.current_status IS NOT DISTINCT FROM OLD.current_status
  THEN
    RETURN NEW;
  END IF;

  PERFORM public.cac_tray_deactivate_if_in_warehouse(NEW.service_order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_series_deactivate_cac_tray_on_warehouse ON public.series;
CREATE TRIGGER trg_series_deactivate_cac_tray_on_warehouse
  AFTER INSERT OR UPDATE OF current_status
  ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_series_deactivate_cac_tray_on_warehouse();

-- 4) RPC de mantenimiento
CREATE OR REPLACE FUNCTION public.cac_tray_deactivate_stale_in_warehouse()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.cac_tray_units t
  SET
    is_active = false,
    excluded_reason = COALESCE(NULLIF(t.excluded_reason, ''), 'left_backoffice_queue'),
    unit_status_label = 'Fuera de cola Backoffice',
    updated_at = now()
  WHERE t.is_active = true
    AND t.service_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.series s WHERE s.service_order_id = t.service_order_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.service_order_id = t.service_order_id
        AND lower(COALESCE(s.current_status::text, '')) IN (
          'recepcionado_bodega_general',
          'in_validation',
          'pendiente_ingreso_bodega'
        )
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.cac_tray_deactivate_stale_in_warehouse() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cac_tray_deactivate_stale_in_warehouse()
  TO service_role, authenticated;

NOTIFY pgrst, 'reload schema';

-- Verificación rápida
SELECT
  count(*) FILTER (WHERE is_active) AS active_total,
  count(*) FILTER (
    WHERE is_active AND tech_id = (
      SELECT id FROM public.technologies WHERE upper(name) = 'EMTA' LIMIT 1
    )
  ) AS active_emta
FROM public.cac_tray_units;
