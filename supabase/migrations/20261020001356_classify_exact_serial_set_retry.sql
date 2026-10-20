-- Exact identity preflight for classify_equipment_batch_tx.
-- Keeps the current per-equipment partial-acceptance contract while ensuring
-- no S1-S4 relationship is written before the whole equipment is validated.

-- Sobrecarga legacy (029): retirada para una sola firma pública de 5 argumentos.
DROP FUNCTION IF EXISTS public.classify_equipment_batch_tx(uuid, uuid, jsonb, text);

DO $classify_promote_writer$
BEGIN
  IF to_regprocedure(
       'public.classify_equipment_batch_tx_validated_write(uuid, uuid, jsonb, text, text)'
     ) IS NULL
     AND to_regprocedure(
       'public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)'
     ) IS NOT NULL THEN
    ALTER FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
      RENAME TO classify_equipment_batch_tx_validated_write;
  END IF;
END
$classify_promote_writer$;

REVOKE ALL ON FUNCTION public.classify_equipment_batch_tx_validated_write(uuid, uuid, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_unit jsonb;
  v_main text;
  v_main_key text;
  v_serials text[];
  v_lock_serial text;
  v_all_locks text[] := ARRAY[]::text[];
  v_claims jsonb := '{}'::jsonb;
  v_seen_main text[] := ARRAY[]::text[];
  v_valid_units jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_skipped integer := 0;
  v_skip boolean;
  v_conflict_serial text;
  v_active record;
  v_active_order public.service_orders%ROWTYPE;
  v_existing_serials text[];
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  -- Acquire every identity lock before reading existing ownership. Sorting the
  -- union prevents crossed S1/S2 batches from deadlocking in opposite order.
  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_main_key := upper(trim(coalesce(v_unit->>'main_serial', '')));
    SELECT coalesce(array_agg(DISTINCT upper(trim(x))), ARRAY[]::text[])
      INTO v_serials
    FROM jsonb_array_elements_text(
      CASE
        WHEN v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array'
          THEN v_unit->'all_series'
        ELSE jsonb_build_array(v_main_key)
      END
    ) AS t(x)
    WHERE public.is_valid_equipment_serial(x);

    IF public.is_valid_equipment_serial(v_main_key) AND NOT (v_main_key = ANY(v_serials)) THEN
      v_serials := array_append(v_serials, v_main_key);
    END IF;
    v_all_locks := v_all_locks || v_serials;
  END LOOP;

  FOR v_lock_serial IN
    SELECT DISTINCT sn FROM unnest(v_all_locks) AS t(sn) ORDER BY sn
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('classify_identity:' || v_lock_serial));
  END LOOP;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_skip := false;
    v_conflict_serial := NULL;
    v_main := trim(coalesce(v_unit->>'main_serial', ''));
    v_main_key := upper(v_main);

    IF v_main = '' OR NOT public.is_valid_equipment_serial(v_main) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'code', 'INVALID_MAIN_SERIAL',
        'main_serial', v_main,
        'error', 'Serie principal inválida.'
      );
      CONTINUE;
    END IF;

    SELECT coalesce(array_agg(DISTINCT upper(trim(x)) ORDER BY upper(trim(x))), ARRAY[]::text[])
      INTO v_serials
    FROM jsonb_array_elements_text(
      CASE
        WHEN v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array'
          THEN v_unit->'all_series'
        ELSE jsonb_build_array(v_main)
      END
    ) AS t(x)
    WHERE public.is_valid_equipment_serial(x);

    IF NOT (v_main_key = ANY(v_serials)) THEN
      SELECT array_agg(sn ORDER BY sn) INTO v_serials
      FROM unnest(array_append(v_serials, v_main_key)) AS t(sn);
    END IF;

    IF v_main_key = ANY(v_seen_main) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'code', 'BATCH_DUPLICATE_MAIN',
        'main_serial', v_main,
        'error', format('Serie duplicada: %s está repetida en este mismo lote.', v_main)
      );
      CONTINUE;
    END IF;
    v_seen_main := array_append(v_seen_main, v_main_key);

    FOREACH v_lock_serial IN ARRAY v_serials
    LOOP
      IF v_claims ? v_lock_serial AND (v_claims->>v_lock_serial) IS DISTINCT FROM v_main_key THEN
        v_conflict_serial := v_lock_serial;
        v_skip := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_skip THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'code', 'BATCH_SERIAL_CROSS_EQUIPMENT',
        'main_serial', v_main,
        'serial', v_conflict_serial,
        'error', format('La serie %s ya fue reclamada por otro equipo en este mismo lote.', v_conflict_serial)
      );
      CONTINUE;
    END IF;

    FOREACH v_lock_serial IN ARRAY v_serials
    LOOP
      v_claims := v_claims || jsonb_build_object(v_lock_serial, v_main_key);
    END LOOP;

    SELECT * INTO v_active
    FROM public.series_active_service_order(v_main_key)
    LIMIT 1;

    IF FOUND AND v_active.service_order_id IS NOT NULL THEN
      SELECT * INTO v_active_order
      FROM public.service_orders
      WHERE id = v_active.service_order_id;

      SELECT coalesce(array_agg(DISTINCT upper(trim(s.serial_number)) ORDER BY upper(trim(s.serial_number))), ARRAY[]::text[])
        INTO v_existing_serials
      FROM public.series s
      WHERE s.service_order_id = v_active_order.id
        AND public.is_valid_equipment_serial(s.serial_number);

      IF upper(trim(v_active_order.main_serial)) IS DISTINCT FROM v_main_key
         OR v_active_order.reception_id IS DISTINCT FROM p_reception_id
         OR v_active_order.sap_transfer_id IS DISTINCT FROM p_sap_transfer_id
         OR v_existing_serials IS DISTINCT FROM v_serials THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'code', 'EQUIPMENT_IDENTITY_MISMATCH',
          'main_serial', v_main,
          'active_os', v_active.os_label,
          'active_status', v_active.status,
          'error', 'La identidad S1-S4 o el contexto recepción/SAP no coincide con la OS activa.'
        );
        CONTINUE;
      END IF;
    ELSE
      SELECT q.sn, q.service_order_id, q.os_label, q.status
        INTO v_active
      FROM (
        SELECT sn, a.*
        FROM unnest(v_serials) AS u(sn)
        CROSS JOIN LATERAL public.series_active_service_order(u.sn) a
        LIMIT 1
      ) q;

      IF FOUND AND v_active.service_order_id IS NOT NULL THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'code', 'PARTIAL_SERIAL_MATCH',
          'main_serial', v_main,
          'serial', v_active.sn,
          'active_os', v_active.os_label,
          'active_status', v_active.status,
          'error', format('La serie %s pertenece a otra identidad de equipo activa.', v_active.sn)
        );
        CONTINUE;
      END IF;
    END IF;

    -- Pass the normalized, complete identity to the already installed writer.
    v_valid_units := v_valid_units || jsonb_build_array(
      jsonb_set(v_unit, '{main_serial}', to_jsonb(v_main_key), true)
        || jsonb_build_object('all_series', to_jsonb(v_serials))
    );
  END LOOP;

  IF jsonb_array_length(v_valid_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar. %',
      coalesce(v_errors->0->>'error', 'Validación fallida.');
  END IF;

  v_result := public.classify_equipment_batch_tx_validated_write(
    p_reception_id,
    p_sap_transfer_id,
    v_valid_units,
    p_registered_by,
    p_correlation_id
  );

  RETURN jsonb_set(
    jsonb_set(
      v_result,
      '{units_skipped}',
      to_jsonb(coalesce((v_result->>'units_skipped')::integer, 0) + v_skipped)
    ),
    '{errors}',
    coalesce(v_result->'errors', '[]'::jsonb) || v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- The historical guard returns early when service_order_id is unchanged, so a
-- transition to a terminal series status did not close its open cycle. Close
-- that cycle at the state transition; the row remains as immutable history.
CREATE OR REPLACE FUNCTION public.trg_close_serial_cycle_on_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_order_id IS NOT NULL
     AND public.series_status_is_terminal(NEW.current_status::text)
     AND NOT public.series_status_is_terminal(OLD.current_status::text) THEN
    UPDATE public.service_order_serial_cycles
    SET unlinked_at = coalesce(unlinked_at, now())
    WHERE upper(trim(serial_number)) = upper(trim(NEW.serial_number))
      AND service_order_id = NEW.service_order_id
      AND unlinked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_close_serial_cycle_on_terminal_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_close_serial_cycle_on_terminal_status ON public.series;
CREATE TRIGGER trg_close_serial_cycle_on_terminal_status
  AFTER UPDATE OF current_status
  ON public.series
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_close_serial_cycle_on_terminal_status();
