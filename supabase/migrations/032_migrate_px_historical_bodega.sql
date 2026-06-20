-- CHG-PX-BODEGA: Migrar series PX históricas atascadas en RECEPCIONADO_BODEGA_GENERAL
-- Contexto: antes del fix en createPxReceptionWithBoxes, PX finalizaba con cajas BOX-xxx
-- pero dejaba current_status = 'RECEPCIONADO_BODEGA_GENERAL' en lugar de 'in_central_warehouse'.
--
-- Alcance: SOLO recepciones source = 'px' con serie ya asignada a caja activa (no ELIMINADO/DESPACHO).
-- NO toca flujo CAC (esas series deben seguir pendientes hasta scan en Bodega gestión).
--
-- Uso en Supabase SQL Editor (ejecutar UNA consulta a la vez, después de correr este archivo):
--   SELECT * FROM public.preview_px_bodega_migration;              -- vista previa (sin paréntesis)
--   SELECT public.migrate_px_historical_bodega_tx(true);            -- dry-run
--   SELECT public.migrate_px_historical_bodega_tx(false);          -- aplicar migración

-- ---------------------------------------------------------------------------
-- 1) Vista previa (solo lectura)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.preview_px_bodega_migration AS
SELECT
  s.id AS series_id,
  s.serial_number,
  s.current_status AS status_actual,
  'in_central_warehouse'::text AS status_nuevo,
  r.id AS reception_id,
  r.guide_number,
  r.sap_document,
  r.status AS reception_status,
  r.created_at AS reception_created_at,
  b.id AS box_id,
  b.box_code,
  b.rack_location
FROM public.series s
INNER JOIN public.receptions r ON r.id = s.current_reception_id
INNER JOIN public.boxes b ON b.id = s.current_box_id AND b.reception_id = r.id
WHERE r.source = 'px'
  AND r.status NOT IN ('ELIMINADO', 'ELIMINADO POR BODEGA', 'ARCHIVADO', 'DEVUELTO')
  AND s.current_status = 'RECEPCIONADO_BODEGA_GENERAL'
  AND s.current_box_id IS NOT NULL
  AND COALESCE(b.rack_location, 'BODEGA_CENTRAL') NOT IN ('ELIMINADO', 'DESPACHO');

COMMENT ON VIEW public.preview_px_bodega_migration IS
  'Series PX elegibles para migrar a in_central_warehouse (recepciones históricas pre-fix).';

-- ---------------------------------------------------------------------------
-- 2) Función transaccional (dry-run o apply)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_px_historical_bodega_tx(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series_ids uuid[];
  v_count integer := 0;
  v_receptions integer := 0;
  v_now timestamptz := now();
BEGIN
  SELECT
    array_agg(s.id ORDER BY s.serial_number),
    COUNT(*)::integer,
    COUNT(DISTINCT r.id)::integer
  INTO v_series_ids, v_count, v_receptions
  FROM public.series s
  INNER JOIN public.receptions r ON r.id = s.current_reception_id
  INNER JOIN public.boxes b ON b.id = s.current_box_id AND b.reception_id = r.id
  WHERE r.source = 'px'
    AND r.status NOT IN ('ELIMINADO', 'ELIMINADO POR BODEGA', 'ARCHIVADO', 'DEVUELTO')
    AND s.current_status = 'RECEPCIONADO_BODEGA_GENERAL'
    AND s.current_box_id IS NOT NULL
    AND COALESCE(b.rack_location, 'BODEGA_CENTRAL') NOT IN ('ELIMINADO', 'DESPACHO');

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'dry_run', p_dry_run,
      'series_updated', 0,
      'receptions_affected', 0,
      'message', 'No hay series PX pendientes de migración.'
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'series_would_update', v_count,
      'receptions_affected', v_receptions,
      'sample_series_ids', (SELECT jsonb_agg(x) FROM (SELECT unnest(v_series_ids[1:LEAST(10, array_length(v_series_ids, 1))]) AS x) t),
      'message', 'Dry-run: ejecute migrate_px_historical_bodega_tx(false) para aplicar.'
    );
  END IF;

  UPDATE public.series s
  SET
    current_status = 'in_central_warehouse',
    updated_at = v_now
  FROM public.receptions r,
       public.boxes b
  WHERE s.id = ANY (v_series_ids)
    AND s.current_reception_id = r.id
    AND s.current_box_id = b.id
    AND b.reception_id = r.id
    AND s.current_status = 'RECEPCIONADO_BODEGA_GENERAL';

  BEGIN
    INSERT INTO public.erp_audit_logs (
      module,
      table_name,
      record_id,
      action,
      severity,
      old_values,
      new_values,
      observations
    )
    SELECT
      'Logística',
      'series',
      s.id::text,
      'MIGRACION PX BODEGA',
      'INFO'::audit_severity,
      jsonb_build_object('current_status', 'RECEPCIONADO_BODEGA_GENERAL'),
      jsonb_build_object(
        'migration', '032_migrate_px_historical_bodega',
        'current_status', 'in_central_warehouse',
        'reception_id', s.current_reception_id,
        'box_id', s.current_box_id,
        'migrated_at', v_now
      ),
      'Migración PX histórico → Bodega General'
    FROM public.series s
    WHERE s.id = ANY (v_series_ids)
      AND s.current_status = 'in_central_warehouse';
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'dry_run', false,
    'series_updated', v_count,
    'receptions_affected', v_receptions,
    'migrated_at', v_now,
    'message', 'Migración PX → in_central_warehouse aplicada.'
  );
END;
$$;

COMMENT ON FUNCTION public.migrate_px_historical_bodega_tx(boolean) IS
  'Migra series PX históricas de RECEPCIONADO_BODEGA_GENERAL a in_central_warehouse. p_dry_run=true solo reporta.';

-- ---------------------------------------------------------------------------
-- 3) Consultas de verificación (ejecutar manualmente post-migración)
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) FROM preview_px_bodega_migration;  -- debe ser 0
-- SELECT current_status, COUNT(*) FROM series s
--   JOIN receptions r ON r.id = s.current_reception_id
--   WHERE r.source = 'px' GROUP BY 1;
