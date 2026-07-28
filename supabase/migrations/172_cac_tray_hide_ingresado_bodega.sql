-- =============================================================================
-- 172 — Historial CAC: ocultar equipos ya en Bodega General
-- =============================================================================
-- "Ingresado a Bodega General" vive en Gestión de Bodega; no debe permanecer
-- activo en la bandeja / Historial Global CAC.
-- =============================================================================

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

-- Al refrescar/upsert: si ya hay serie en bodega central, desactivar de la bandeja.
CREATE OR REPLACE FUNCTION public.cac_tray_deactivate_if_in_warehouse(p_os_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_os_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.series s
    WHERE s.service_order_id = p_os_id
      AND s.brand_id IS NOT NULL
      AND lower(COALESCE(s.current_status::text, '')) IN (
        'in_central_warehouse',
        'ingresado_bodega'
      )
  ) THEN
    UPDATE public.cac_tray_units
    SET
      is_active = false,
      excluded_reason = COALESCE(NULLIF(excluded_reason, ''), 'ingresado_bodega_general'),
      unit_status = 'ingresado_bodega',
      unit_status_label = 'Ingresado a Bodega General',
      updated_at = now()
    WHERE service_order_id = p_os_id
      AND is_active = true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cac_tray_deactivate_if_in_warehouse(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cac_tray_deactivate_if_in_warehouse(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cac_tray_deactivate_if_in_warehouse(uuid) IS
  'Desactiva fila de cac_tray_units cuando la OS ya tiene series en Bodega General.';
