-- 217: Historial CAC — limpiar backlog ya en Bodega + mantener dato real (trigger).
-- Al pasar series a in_central_warehouse / ingresado_bodega, desactiva cac_tray_units
-- de esa OS de inmediato (no depender de abrir Historial).

-- 1) Limpieza masiva (mismo criterio que migración 172)
UPDATE public.cac_tray_units t
SET
  is_active = false,
  excluded_reason = COALESCE(NULLIF(t.excluded_reason, ''), 'ingresado_bodega_general'),
  unit_status = CASE
    WHEN lower(COALESCE(t.unit_status, '')) IN ('ingresado_bodega', 'in_central_warehouse')
      THEN t.unit_status
    ELSE 'ingresado_bodega'
  END,
  unit_status_label = 'Ingresado a Bodega General',
  updated_at = now()
WHERE t.is_active = true
  AND (
    lower(COALESCE(t.unit_status, '')) IN ('ingresado_bodega', 'in_central_warehouse')
    OR COALESCE(t.unit_status_label, '') ILIKE '%bodega general%'
    OR EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.service_order_id = t.service_order_id
        AND s.brand_id IS NOT NULL
        AND lower(COALESCE(s.current_status::text, '')) IN (
          'in_central_warehouse',
          'ingresado_bodega'
        )
    )
  );

-- 2) RPC de mantenimiento (por si hace falta re-ejecutar sin reaplicar migración)
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
    excluded_reason = COALESCE(NULLIF(t.excluded_reason, ''), 'ingresado_bodega_general'),
    unit_status = CASE
      WHEN lower(COALESCE(t.unit_status, '')) IN ('ingresado_bodega', 'in_central_warehouse')
        THEN t.unit_status
      ELSE 'ingresado_bodega'
    END,
    unit_status_label = 'Ingresado a Bodega General',
    updated_at = now()
  WHERE t.is_active = true
    AND (
      lower(COALESCE(t.unit_status, '')) IN ('ingresado_bodega', 'in_central_warehouse')
      OR COALESCE(t.unit_status_label, '') ILIKE '%bodega general%'
      OR EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.service_order_id = t.service_order_id
          AND s.brand_id IS NOT NULL
          AND lower(COALESCE(s.current_status::text, '')) IN (
            'in_central_warehouse',
            'ingresado_bodega'
          )
      )
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.cac_tray_deactivate_stale_in_warehouse() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cac_tray_deactivate_stale_in_warehouse()
  TO service_role, authenticated;

COMMENT ON FUNCTION public.cac_tray_deactivate_stale_in_warehouse() IS
  'Desactiva filas activas de cac_tray_units cuya OS ya tiene series en Bodega General.';

-- 3) Trigger: al entrar a Bodega Central, Historial baja al instante
CREATE OR REPLACE FUNCTION public.trg_series_deactivate_cac_tray_on_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.service_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_status := lower(COALESCE(NEW.current_status::text, ''));
  IF v_status NOT IN ('in_central_warehouse', 'ingresado_bodega') THEN
    RETURN NEW;
  END IF;

  -- Solo cuando cambia a bodega (o insert ya en bodega)
  IF TG_OP = 'UPDATE'
     AND lower(COALESCE(OLD.current_status::text, '')) IN ('in_central_warehouse', 'ingresado_bodega')
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

NOTIFY pgrst, 'reload schema';
