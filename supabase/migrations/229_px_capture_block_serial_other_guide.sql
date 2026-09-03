-- =============================================================================
-- 229 — PX captura: avisar y BLOQUEAR si la serie ya está en otra guía o caja
--
-- Problema (REC-800089 / TCW0043):
--   Dos guías abiertas en paralelo podían capturar el mismo serial_s4.
--   Al Finalizar, el promote tumbaba el lote entero por OS activa.
--
-- Regla de producto:
--   Antes de continuar el pistoleo, el operador DEBE eliminar el duplicado.
--   No se permite capturar una serie ya presente en:
--     a) otra caja de la misma guía (active)
--     b) otra guía con equipo aún active
--     c) inventario TC con OS/ciclo activo (ya existía DUPLICATE_GLOBAL)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.px_find_active_serial_capture(p_serial text)
RETURNS TABLE (
  reception_id uuid,
  guide_number text,
  sap_document text,
  box_id uuid,
  box_code text,
  equipment_id uuid,
  main_serial text,
  slot smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    e.reception_id,
    r.guide_number,
    r.sap_document,
    e.box_id,
    b.box_code,
    e.id AS equipment_id,
    e.main_serial,
    sl.slot
  FROM public.px_reception_serial_lines sl
  JOIN public.px_reception_equipment e
    ON e.id = sl.equipment_id
   AND e.capture_status = 'active'
  JOIN public.receptions r ON r.id = e.reception_id
  JOIN public.boxes b ON b.id = e.box_id
  WHERE upper(sl.serial_number) = upper(trim(p_serial))
    AND upper(coalesce(r.status, '')) NOT IN (
      'ELIMINADO', 'ELIMINADO POR BODEGA', 'ARCHIVADO', 'DEVUELTO'
    )
  ORDER BY e.captured_at NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.px_find_active_serial_capture(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.px_find_active_serial_capture(text)
  TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_px_serial_lines_serial_number
  ON public.px_reception_serial_lines (serial_number);

CREATE OR REPLACE FUNCTION public.capture_px_equipment_tx(
  p_reception_id uuid,
  p_box_id uuid,
  p_main_serial text,
  p_serial_s2 text DEFAULT NULL,
  p_serial_s3 text DEFAULT NULL,
  p_serial_s4 text DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_model_id uuid DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_captured_by uuid DEFAULT NULL,
  p_operator_name text DEFAULT 'OPERADOR',
  p_workstation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_box public.boxes%ROWTYPE;
  v_main text;
  v_serials text[];
  v_sn text;
  v_active integer;
  v_declared integer;
  v_equipment_id uuid;
  v_slot smallint;
  v_hit record;
  v_where text;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');
  v_main := upper(trim(coalesce(p_main_serial, '')));
  IF v_main = '' THEN
    RAISE EXCEPTION 'DUPLICATE_INVALID: Serie principal obligatoria.';
  END IF;

  SELECT * INTO v_rec FROM public.receptions WHERE id = p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Recepción no encontrada.'; END IF;
  IF upper(coalesce(v_rec.status, '')) NOT IN ('EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR') THEN
    RAISE EXCEPTION 'INVALID_STATE: La recepción no acepta capturas.';
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id AND reception_id = p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Caja no encontrada.'; END IF;

  IF v_box.status::text IN ('cerrada', 'closed') THEN
    RAISE EXCEPTION 'BOX_LOCKED: La caja está cerrada.';
  END IF;

  IF v_box.locked_by IS NULL OR v_box.lock_expires_at <= now() THEN
    RAISE EXCEPTION 'BOX_NOT_LOCKED: Debe tomar control de la caja antes de escanear.';
  END IF;

  IF v_box.locked_by IS DISTINCT FROM p_captured_by THEN
    RAISE EXCEPTION 'BOX_LOCKED: Otro operador tiene control de esta caja.';
  END IF;

  v_declared := coalesce(v_box.declared_quantity, v_box.capacity, 0);
  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  IF v_declared > 0 AND v_active >= v_declared THEN
    RAISE EXCEPTION 'BOX_FULL: La caja alcanzó su capacidad (%).', v_declared;
  END IF;

  v_serials := ARRAY[v_main];
  IF p_serial_s2 IS NOT NULL AND trim(p_serial_s2) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s2)));
  END IF;
  IF p_serial_s3 IS NOT NULL AND trim(p_serial_s3) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s3)));
  END IF;
  IF p_serial_s4 IS NOT NULL AND trim(p_serial_s4) <> '' THEN
    v_serials := array_append(v_serials, upper(trim(p_serial_s4)));
  END IF;

  IF (SELECT count(DISTINCT s) FROM unnest(v_serials) s) <> array_length(v_serials, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_IN_EQUIPMENT: Series duplicadas en el mismo equipo.';
  END IF;

  FOREACH v_sn IN ARRAY v_serials LOOP
    -- 1) Ya capturada en alguna guía/caja con equipo active → bloquear y pedir eliminar
    SELECT * INTO v_hit
    FROM public.px_find_active_serial_capture(v_sn);

    IF FOUND THEN
      v_where := format(
        'guía %s%s caja %s',
        coalesce(nullif(trim(v_hit.guide_number), ''), '(sin guía)'),
        CASE
          WHEN nullif(trim(coalesce(v_hit.sap_document, '')), '') IS NOT NULL
            THEN ' (SAP ' || trim(v_hit.sap_document) || ')'
          ELSE ''
        END,
        coalesce(nullif(trim(v_hit.box_code), ''), '(sin caja)')
      );

      IF v_hit.reception_id = p_reception_id THEN
        RAISE EXCEPTION
          'DUPLICATE_IN_RECEPTION: La serie % ya está en % de ESTA guía. Elimine el duplicado de esa caja antes de continuar.',
          v_sn, v_where;
      END IF;

      RAISE EXCEPTION
        'DUPLICATE_IN_OTHER_GUIDE: La serie % ya está en % (otra recepción abierta). Elimine el duplicado ahí antes de continuar.',
        v_sn, v_where;
    END IF;

    -- 2) Ya en inventario TC con ciclo/OS activo
    IF public.px_is_serial_blocked_in_inventory(v_sn) THEN
      RAISE EXCEPTION
        'DUPLICATE_GLOBAL: La serie % ya está en inventario TC (orden abierta). No capture de nuevo; resuelva el ciclo existente.',
        v_sn;
    END IF;
  END LOOP;

  INSERT INTO public.px_reception_equipment (
    reception_id, box_id, main_serial, serial_s2, serial_s3, serial_s4,
    brand_id, model_id, material, captured_by, captured_by_name, capture_workstation
  ) VALUES (
    p_reception_id, p_box_id, v_main,
    NULLIF(upper(trim(coalesce(p_serial_s2, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s3, ''))), ''),
    NULLIF(upper(trim(coalesce(p_serial_s4, ''))), ''),
    p_brand_id, p_model_id, NULLIF(trim(coalesce(p_material, '')), ''),
    p_captured_by, NULLIF(trim(coalesce(p_operator_name, '')), ''), NULLIF(trim(coalesce(p_workstation, '')), '')
  )
  RETURNING id INTO v_equipment_id;

  v_slot := 1;
  FOREACH v_sn IN ARRAY v_serials LOOP
    INSERT INTO public.px_reception_serial_lines (
      equipment_id, reception_id, box_id, serial_number, slot
    ) VALUES (v_equipment_id, p_reception_id, p_box_id, v_sn, v_slot);
    v_slot := v_slot + 1;
  END LOOP;

  SELECT count(*)::integer INTO v_active
  FROM public.px_reception_equipment
  WHERE box_id = p_box_id AND capture_status = 'active';

  UPDATE public.boxes SET
    status = 'incompleta'::public.box_status,
    lock_expires_at = now() + interval '30 minutes',
    version = version + 1
  WHERE id = p_box_id;

  PERFORM public.px_log_activity(
    p_reception_id, p_box_id, 'equipment_captured',
    coalesce(p_operator_name, 'Operador') || ' capturó ' || v_main,
    p_captured_by, p_operator_name, jsonb_build_object('equipment_id', v_equipment_id)
  );

  RETURN jsonb_build_object(
    'equipment_id', v_equipment_id,
    'main_serial', v_main,
    'captured_count', v_active,
    'declared_quantity', v_declared,
    'box_status', (SELECT status::text FROM public.boxes WHERE id = p_box_id)
  );
END;
$$;

-- Allowlist (si aplica en entornos con 151)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_allow_definer_rpc'
  ) THEN
    NULL; -- allowlist se gestiona por nombre en migraciones previas; no requiere INSERT aquí
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
