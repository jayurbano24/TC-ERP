-- 140: Reglas de dominio OS / serie / reingreso
--
-- Reglas:
--  1) OS irrepetible (no reutilizar)
--  2) Una serie solo en UNA OS activa
--  3) Bloquear creación si hay OS activa (o serie no terminal)
--  4) Reingreso solo si ciclo anterior cerrado → OS nueva
--  5) reentry_count derivado del historial por main_serial
--  6) Historial de ciclos; no "robar" serie de OS activa vía ON CONFLICT
--
-- Ejecutar en SQL Editor (sesión writable).

-- ---------------------------------------------------------------------------
-- 1) Helpers de dominio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_equipment_serial(p_serial text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_serial IS NOT NULL
    AND length(trim(p_serial)) >= 3
    AND upper(trim(p_serial)) NOT IN ('0', 'N/A', 'NA', 'NULL', 'NONE', 'S/N', 'SN', '-', '--', '---')
    AND upper(trim(p_serial)) !~ '^[0]+$';
$$;

CREATE OR REPLACE FUNCTION public.service_order_status_is_closed(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(trim(coalesce(p_status, ''))) IN (
    'ENTREGADO',
    'CANCELADO',
    'SCRAP',
    'DESTRUIDO',
    'CERRADO',
    'DESPACHADO',
    'DEVUELTO',
    'ELIMINADO',
    'ELIMINADO POR BODEGA',
    'ARCHIVADO'
  );
$$;

CREATE OR REPLACE FUNCTION public.series_status_is_terminal(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(coalesce(p_status, ''))) IN (
    'dispatched',
    'returned',
    'scrap',
    'destroyed',
    'cancelled',
    'canceled'
  );
$$;

CREATE OR REPLACE FUNCTION public.equipment_closed_cycle_count(p_serials text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cleaned AS (
    SELECT DISTINCT upper(trim(sn)) AS sn
    FROM unnest(COALESCE(p_serials, ARRAY[]::text[])) AS t(sn)
    WHERE public.is_valid_equipment_serial(sn)
  ),
  related AS (
    SELECT DISTINCT so.id, so.status
    FROM public.service_orders so
    JOIN cleaned c ON upper(trim(so.main_serial)) = c.sn

    UNION

    SELECT DISTINCT so.id, so.status
    FROM public.series s
    JOIN cleaned c ON upper(trim(s.serial_number)) = c.sn
    JOIN public.service_orders so ON so.id = s.service_order_id
  )
  SELECT COALESCE(COUNT(*), 0)::integer
  FROM related r
  WHERE public.service_order_status_is_closed(r.status);
$$;

CREATE OR REPLACE FUNCTION public.next_equipment_reentry_count(p_serials text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Fuente de verdad: ciclos CERRADOS + 1 (nuevo ingreso).
  -- No cuenta OS activas (evita inflar con cascarones / duplicados abiertos).
  SELECT public.equipment_closed_cycle_count(p_serials) + 1;
$$;

REVOKE ALL ON FUNCTION public.is_valid_equipment_serial(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_order_status_is_closed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.series_status_is_terminal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_closed_cycle_count(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_equipment_reentry_count(text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_valid_equipment_serial(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_order_status_is_closed(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.series_status_is_terminal(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_closed_cycle_count(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_equipment_reentry_count(text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Historial de ciclos serie ↔ OS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_order_serial_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text NOT NULL,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  cycle_no integer NOT NULL DEFAULT 1,
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz NULL,
  CONSTRAINT service_order_serial_cycles_serial_os_uid UNIQUE (serial_number, service_order_id)
);

CREATE INDEX IF NOT EXISTS idx_sosc_serial_upper
  ON public.service_order_serial_cycles (upper(trim(serial_number)));

CREATE INDEX IF NOT EXISTS idx_sosc_os
  ON public.service_order_serial_cycles (service_order_id);

CREATE INDEX IF NOT EXISTS idx_sosc_open
  ON public.service_order_serial_cycles (serial_number)
  WHERE unlinked_at IS NULL;

ALTER TABLE public.service_order_serial_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sosc_select_authenticated ON public.service_order_serial_cycles;
CREATE POLICY sosc_select_authenticated
  ON public.service_order_serial_cycles
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.service_order_serial_cycles TO authenticated;
GRANT ALL ON public.service_order_serial_cycles TO service_role;

-- ---------------------------------------------------------------------------
-- 3) ¿La serie tiene OS activa?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.series_active_service_order(p_serial text)
RETURNS TABLE (
  service_order_id uuid,
  os_label text,
  status text,
  series_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sn AS (
    SELECT upper(trim(p_serial)) AS serial
    WHERE public.is_valid_equipment_serial(p_serial)
  )
  SELECT
    so.id,
    so.os_label,
    so.status,
    s.current_status::text
  FROM sn
  JOIN public.series s ON upper(trim(s.serial_number)) = sn.serial
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE NOT public.service_order_status_is_closed(so.status)
    AND NOT public.series_status_is_terminal(s.current_status::text)

  UNION

  -- OS activa por main_serial aunque la serie ya no apunte (cascarón reciente)
  SELECT
    so.id,
    so.os_label,
    so.status,
    NULL::text
  FROM sn
  JOIN public.service_orders so ON upper(trim(so.main_serial)) = sn.serial
  WHERE NOT public.service_order_status_is_closed(so.status)
    AND EXISTS (
      SELECT 1
      FROM public.series sx
      WHERE sx.service_order_id = so.id
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.series_active_service_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_active_service_order(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Guard en series: no robar de OS activa; registrar ciclos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_series_service_order_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_old_os_label text;
  v_cycle integer;
BEGIN
  IF NOT public.is_valid_equipment_serial(NEW.serial_number) THEN
    -- Permitir persistencia legacy, pero no abrir ciclo
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.service_order_id IS NOT DISTINCT FROM NEW.service_order_id THEN
    RETURN NEW;
  END IF;

  -- Desvincular serie (NULL) siempre permitido; cierra ciclo abierto
  IF TG_OP = 'UPDATE'
     AND OLD.service_order_id IS NOT NULL
     AND NEW.service_order_id IS NULL THEN
    UPDATE public.service_order_serial_cycles
    SET unlinked_at = now()
    WHERE serial_number = OLD.serial_number
      AND service_order_id = OLD.service_order_id
      AND unlinked_at IS NULL;
    RETURN NEW;
  END IF;

  -- Cambio de OS: la anterior debe estar cerrada o la serie en estado terminal
  IF TG_OP = 'UPDATE'
     AND OLD.service_order_id IS NOT NULL
     AND OLD.service_order_id IS DISTINCT FROM NEW.service_order_id THEN
    SELECT so.status, so.os_label
      INTO v_old_status, v_old_os_label
    FROM public.service_orders so
    WHERE so.id = OLD.service_order_id;

    IF v_old_status IS NOT NULL
       AND NOT public.service_order_status_is_closed(v_old_status)
       AND NOT public.series_status_is_terminal(OLD.current_status::text) THEN
      RAISE EXCEPTION
        'La serie % ya posee una Orden de Servicio activa (% / %).',
        NEW.serial_number, coalesce(v_old_os_label, OLD.service_order_id::text), v_old_status
        USING ERRCODE = 'check_violation';
    END IF;

    -- Si la serie ya salió pero la OS quedó abierta, cerrar ciclo
    IF v_old_status IS NOT NULL
       AND NOT public.service_order_status_is_closed(v_old_status)
       AND public.series_status_is_terminal(OLD.current_status::text) THEN
      UPDATE public.service_orders
      SET status = 'DESPACHADO',
          closed_at = coalesce(closed_at, now())
      WHERE id = OLD.service_order_id
        AND NOT public.service_order_status_is_closed(status);
    END IF;

    UPDATE public.service_order_serial_cycles
    SET unlinked_at = now()
    WHERE serial_number = OLD.serial_number
      AND service_order_id = OLD.service_order_id
      AND unlinked_at IS NULL;
  END IF;

  IF NEW.service_order_id IS NOT NULL THEN
    SELECT coalesce(so.reentry_count, 1) INTO v_cycle
    FROM public.service_orders so
    WHERE so.id = NEW.service_order_id;

    INSERT INTO public.service_order_serial_cycles (
      serial_number, service_order_id, cycle_no, linked_at
    ) VALUES (
      NEW.serial_number, NEW.service_order_id, coalesce(v_cycle, 1), now()
    )
    ON CONFLICT (serial_number, service_order_id) DO UPDATE
      SET unlinked_at = NULL,
          linked_at = COALESCE(public.service_order_serial_cycles.linked_at, EXCLUDED.linked_at),
          cycle_no = EXCLUDED.cycle_no;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_series_service_order_guard ON public.series;
CREATE TRIGGER trg_series_service_order_guard
  BEFORE INSERT OR UPDATE OF service_order_id, current_status, serial_number
  ON public.series
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_series_service_order_guard();

-- ---------------------------------------------------------------------------
-- 5) Classify endurecido (lock + validación + anti-duplicado en lote)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classify_equipment_batch_tx(
  p_reception_id uuid,
  p_sap_transfer_id uuid,
  p_units jsonb,
  p_registered_by text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '300s'
AS $$
DECLARE
  v_sap public.sap_transfer_documents%ROWTYPE;
  v_unit jsonb;
  v_main_serial text;
  v_main_key text;
  v_model_id uuid;
  v_brand_id uuid;
  v_material text;
  v_reentry_count integer;
  v_os_id uuid;
  v_os_rec public.service_orders%ROWTYPE;
  v_sn text;
  v_series_id uuid;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_service_orders jsonb := '[]'::jsonb;
  v_series_ids jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_correlation text;
  v_all_serials text[];
  v_active record;
  v_seen text[] := ARRAY[]::text[];
BEGIN
  PERFORM set_config('statement_timeout', '300s', true);

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_correlation := coalesce(nullif(trim(p_correlation_id), ''), p_reception_id::text);

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  SELECT * INTO v_sap
  FROM public.sap_transfer_documents
  WHERE id = p_sap_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento SAP no encontrado.';
  END IF;

  IF v_sap.reception_id <> p_reception_id THEN
    RAISE EXCEPTION 'El documento SAP no pertenece a la recepción indicada.';
  END IF;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_main_serial := trim(COALESCE(v_unit->>'main_serial', ''));
    IF v_main_serial = '' OR NOT public.is_valid_equipment_serial(v_main_serial) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'main_serial', v_main_serial,
        'error', 'Serie principal inválida.'
      );
      CONTINUE;
    END IF;

    v_main_key := upper(v_main_serial);

    -- Anti-duplicado dentro del mismo lote
    IF v_main_key = ANY (v_seen) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'main_serial', v_main_serial,
        'error', format('La serie %s ya fue clasificada en este mismo lote.', v_main_serial)
      );
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_main_key);

    -- Lock transaccional por main_serial
    PERFORM pg_advisory_xact_lock(hashtext(v_main_key));

    -- Seriales del equipo (válidos)
    SELECT COALESCE(
      array_agg(DISTINCT upper(trim(x))) FILTER (WHERE public.is_valid_equipment_serial(x)),
      ARRAY[v_main_key]
    )
    INTO v_all_serials
    FROM jsonb_array_elements_text(
      CASE
        WHEN v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array'
          THEN v_unit->'all_series'
        ELSE jsonb_build_array(v_main_serial)
      END
    ) AS t(x);

    -- ¿Alguna serie del equipo tiene OS activa?
    v_active := NULL;
    SELECT * INTO v_active
    FROM (
      SELECT a.*
      FROM unnest(v_all_serials) AS u(sn)
      CROSS JOIN LATERAL public.series_active_service_order(u.sn) a
      LIMIT 1
    ) q;

    IF FOUND AND v_active.service_order_id IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'main_serial', v_main_serial,
        'active_os', v_active.os_label,
        'active_status', v_active.status,
        'error', format(
          'La serie ya posee una Orden de Servicio activa (%s / %s).',
          coalesce(v_active.os_label, v_active.service_order_id::text),
          v_active.status
        )
      );
      CONTINUE;
    END IF;

    -- Cerrar OS huérfanas abiertas del main_serial si la serie ya está terminal
    UPDATE public.service_orders so
    SET status = 'DESPACHADO',
        closed_at = coalesce(so.closed_at, now())
    WHERE upper(trim(so.main_serial)) = v_main_key
      AND NOT public.service_order_status_is_closed(so.status)
      AND EXISTS (
        SELECT 1
        FROM public.series s
        WHERE upper(trim(s.serial_number)) = ANY (v_all_serials)
          AND public.series_status_is_terminal(s.current_status::text)
      );

    v_reentry_count := public.next_equipment_reentry_count(v_all_serials);
    v_model_id := NULLIF(trim(COALESCE(v_unit->>'model_id', '')), '')::uuid;
    v_brand_id := NULLIF(trim(COALESCE(v_unit->>'brand_id', '')), '')::uuid;
    v_material := NULLIF(trim(COALESCE(v_unit->>'material', '')), '');

    INSERT INTO public.service_orders (
      reception_id,
      reception_guide_id,
      sap_transfer_id,
      model_id,
      brand_id,
      main_serial,
      reentry_count,
      status
    ) VALUES (
      p_reception_id,
      v_sap.reception_guide_id,
      p_sap_transfer_id,
      v_model_id,
      v_brand_id,
      v_main_serial,
      v_reentry_count,
      'INGRESADO'
    )
    RETURNING * INTO v_os_rec;

    v_os_id := v_os_rec.id;

    FOREACH v_sn IN ARRAY v_all_serials
    LOOP
      BEGIN
        INSERT INTO public.series (
          serial_number,
          current_reception_id,
          service_order_id,
          sap_transfer_id,
          current_status,
          model_id,
          brand_id,
          material,
          updated_at
        ) VALUES (
          v_sn,
          p_reception_id,
          v_os_id,
          p_sap_transfer_id,
          'RECEPCIONADO_BODEGA_GENERAL',
          v_model_id,
          v_brand_id,
          v_material,
          now()
        )
        ON CONFLICT (serial_number) DO UPDATE SET
          current_reception_id = EXCLUDED.current_reception_id,
          service_order_id = EXCLUDED.service_order_id,
          sap_transfer_id = EXCLUDED.sap_transfer_id,
          current_status = EXCLUDED.current_status,
          model_id = EXCLUDED.model_id,
          brand_id = EXCLUDED.brand_id,
          material = COALESCE(EXCLUDED.material, public.series.material),
          updated_at = now()
        WHERE
          public.series.service_order_id IS NULL
          OR public.series.service_order_id = EXCLUDED.service_order_id
          OR public.service_order_status_is_closed((
               SELECT so2.status FROM public.service_orders so2
               WHERE so2.id = public.series.service_order_id
             ))
          OR public.series_status_is_terminal(public.series.current_status::text)
        RETURNING id INTO v_series_id;

        IF v_series_id IS NOT NULL THEN
          v_series_ids := v_series_ids || to_jsonb(v_series_id);
        ELSE
          -- ON CONFLICT no actualizó (OS activa) — no debería ocurrir tras el check
          RAISE EXCEPTION
            'La serie % ya posee una Orden de Servicio activa.',
            v_sn
            USING ERRCODE = 'check_violation';
        END IF;
      EXCEPTION
        WHEN check_violation THEN
          -- Rollback de esta OS recién creada si no se pudo vincular serie
          DELETE FROM public.service_orders WHERE id = v_os_id;
          v_skipped := v_skipped + 1;
          v_errors := v_errors || jsonb_build_object(
            'main_serial', v_main_serial,
            'serial', v_sn,
            'error', SQLERRM
          );
          v_os_id := NULL;
          EXIT;
      END;
    END LOOP;

    IF v_os_id IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM public.upsert_cac_tray_unit_from_os(v_os_id);

    IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
      PERFORM public.emit_domain_event(
        'equipment.classified',
        'service_order',
        v_os_id::text,
        jsonb_build_object(
          'receptionId', p_reception_id,
          'sapTransferId', p_sap_transfer_id,
          'mainSerial', v_main_serial,
          'reentryCount', v_reentry_count,
          'registeredBy', p_registered_by
        ),
        v_correlation,
        'cac',
        p_registered_by
      );
    END IF;

    v_service_orders := v_service_orders || row_to_json(v_os_rec)::jsonb;
    v_processed := v_processed + 1;
  END LOOP;

  IF v_processed = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar. %',
      CASE WHEN jsonb_array_length(v_errors) > 0
        THEN coalesce(v_errors->0->>'error', 'Validación fallida.')
        ELSE 'Lote vacío o series inválidas.'
      END;
  END IF;

  IF to_regprocedure('public.emit_domain_event(text,text,text,jsonb,text,text,text,uuid)') IS NOT NULL THEN
    PERFORM public.emit_domain_event(
      'equipment.batch_classified',
      'reception',
      p_reception_id::text,
      jsonb_build_object(
        'sapTransferId', p_sap_transfer_id,
        'unitsProcessed', v_processed,
        'unitsSkipped', v_skipped,
        'errors', v_errors,
        'registeredBy', p_registered_by
      ),
      v_correlation,
      'cac',
      p_registered_by
    );
  END IF;

  RETURN jsonb_build_object(
    'service_orders', v_service_orders,
    'series_ids', v_series_ids,
    'registered_by', p_registered_by,
    'correlation_id', v_correlation,
    'units_processed', v_processed,
    'units_skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Saneamiento de datos
-- ---------------------------------------------------------------------------

-- 6a) Cerrar OS cascarón: INGRESADO sin series, con otra OS más nueva mismo main_serial
UPDATE public.service_orders so
SET
  status = 'CANCELADO',
  closed_at = coalesce(so.closed_at, now())
WHERE NOT public.service_order_status_is_closed(so.status)
  AND public.is_valid_equipment_serial(so.main_serial)
  AND NOT EXISTS (
    SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
  )
  AND EXISTS (
    SELECT 1
    FROM public.service_orders newer
    WHERE upper(trim(newer.main_serial)) = upper(trim(so.main_serial))
      AND newer.created_at > so.created_at
      AND newer.id <> so.id
  );

-- 6b) Duplicados activos mismo main_serial: conservar la que tiene series (o la más nueva)
WITH ranked AS (
  SELECT
    so.id,
    so.main_serial,
    so.created_at,
    EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id) AS has_series,
    ROW_NUMBER() OVER (
      PARTITION BY upper(trim(so.main_serial))
      ORDER BY
        EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id) DESC,
        so.created_at DESC,
        so.id DESC
    ) AS rn
  FROM public.service_orders so
  WHERE NOT public.service_order_status_is_closed(so.status)
    AND public.is_valid_equipment_serial(so.main_serial)
)
UPDATE public.service_orders so
SET
  status = 'CANCELADO',
  closed_at = coalesce(so.closed_at, now())
FROM ranked r
WHERE so.id = r.id
  AND r.rn > 1;

-- 6c) Serie basura "0": desvincular de OS operativa
UPDATE public.series
SET service_order_id = NULL,
    updated_at = now()
WHERE serial_number = '0'
  AND service_order_id IS NOT NULL;

UPDATE public.service_orders
SET
  status = 'CANCELADO',
  closed_at = coalesce(closed_at, now())
WHERE main_serial = '0'
  AND NOT public.service_order_status_is_closed(status);

-- 6d) Recalcular reentry_count por historial (orden cronológico por main_serial válido)
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

-- 6e) Backfill ciclos desde series actuales
INSERT INTO public.service_order_serial_cycles (serial_number, service_order_id, cycle_no, linked_at)
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

-- Backfill: OS históricas por main_serial (cascarones / ciclos previos)
INSERT INTO public.service_order_serial_cycles (serial_number, service_order_id, cycle_no, linked_at, unlinked_at)
SELECT
  so.main_serial,
  so.id,
  coalesce(so.reentry_count, 1),
  so.created_at,
  CASE
    WHEN public.service_order_status_is_closed(so.status) THEN coalesce(so.closed_at, so.created_at)
    WHEN EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id) THEN NULL
    ELSE coalesce(so.closed_at, now())
  END
FROM public.service_orders so
WHERE public.is_valid_equipment_serial(so.main_serial)
ON CONFLICT (serial_number, service_order_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Índice único: una sola OS activa por main_serial válido
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_orders_active_main_serial
  ON public.service_orders (upper(trim(main_serial)))
  WHERE NOT public.service_order_status_is_closed(status)
    AND public.is_valid_equipment_serial(main_serial);

NOTIFY pgrst, 'reload schema';
