-- 289: workshop_operate_batch_tx — transición atómica de etapa de Taller
-- SSOT destinos: cat_diagnostics.allowed_outcomes (NO literales de nombre de falla).
-- Remediation: G2 auth.uid() only · reject service_role · idempotency table · G3/G4
-- DRAFT: no apply a producción sin gate + autorización explícita.

CREATE TABLE IF NOT EXISTS public.workshop_operate_idempotency (
  idempotency_key uuid PRIMARY KEY,
  operator_id uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workshop_operate_idempotency IS
  '289: idempotencia de workshop_operate_batch_tx (misma TX que update+audit).';

CREATE OR REPLACE FUNCTION public.workshop_operate_batch_tx(
  p_series_ids uuid[],
  p_action_name text,
  p_result text,
  p_notes text DEFAULT '',
  p_diagnostics text[] DEFAULT '{}',
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  v_uid uuid;
  v_action text := trim(coalesce(p_action_name, ''));
  v_result text := trim(coalesce(p_result, ''));
  v_notes text := coalesce(p_notes, '');
  v_diag_ids text[] := coalesce(p_diagnostics, '{}');
  v_diag_uuids uuid[] := '{}';
  v_next_status text;
  v_allowed_results text[];
  v_expected_origin text;
  v_processed integer := 0;
  v_audit_count integer := 0;
  v_requested integer := 0;
  v_expanded integer := 0;
  v_bad_status text;
  v_bad_id uuid;
  v_outcome_ok boolean;
  v_persist_diagnostics boolean := false;
  v_persist_repairs boolean := false;
  v_user_role text;
  v_request_hash text;
  v_prior_result jsonb;
  v_prior_hash text;
  v_prior_op uuid;
  v_out jsonb;
BEGIN
  -- G2: nunca aceptar service_role como suplente de operador
  IF v_jwt_role = 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: workshop_operate_batch_tx requires user JWT, not service_role'
      USING ERRCODE = '42501';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Compat: p_operator_id solo se admite si coincide exactamente con auth.uid()
  IF p_operator_id IS NOT NULL AND p_operator_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: operator_id does not match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.app_assert_any_role(
    'admin'::public.app_role,
    'supervisor'::public.app_role,
    'tecnico'::public.app_role,
    'qc'::public.app_role
  );

  IF p_series_ids IS NULL OR coalesce(cardinality(p_series_ids), 0) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'processed', 0,
      'requested_series', 0,
      'expanded_series', 0
    );
  END IF;

  v_requested := cardinality(p_series_ids);

  BEGIN
    SELECT coalesce(array_agg(DISTINCT trim(x)::uuid), '{}'::uuid[])
      INTO v_diag_uuids
    FROM unnest(v_diag_ids) AS x
    WHERE trim(x) <> '';
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED: Identificador de catálogo inválido.'
        USING ERRCODE = 'P0001';
  END;

  v_request_hash := md5(
    convert_to(
      jsonb_build_object(
        'series', (
          SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb)
          FROM unnest(p_series_ids) AS x
        ),
        'action', v_action,
        'result', v_result,
        'notes', v_notes,
        'diagnostics', (
          SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb)
          FROM unnest(v_diag_ids) AS x
        )
      )::text,
      'UTF8'
    )
  );

  -- G4 idempotencia: serializar por clave y reutilizar resultado confirmado
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key::text));

    SELECT i.result, i.request_hash, i.operator_id
      INTO v_prior_result, v_prior_hash, v_prior_op
    FROM public.workshop_operate_idempotency i
    WHERE i.idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_prior_op IS DISTINCT FROM v_uid OR v_prior_hash IS DISTINCT FROM v_request_hash THEN
        RAISE EXCEPTION
          'CONFLICT: idempotency key reused with different operator or parameters'
          USING ERRCODE = 'P0001';
      END IF;
      RETURN v_prior_result;
    END IF;
  END IF;

  CASE v_action
    WHEN 'DIAGNÓSTICO INICIAL COMPLETADO' THEN
      v_allowed_results := ARRAY['reacondicionado', 'reparacion', 'l3'];
      v_expected_origin := 'in_workshop';
      v_persist_diagnostics := true;
    WHEN 'REPARACIÓN COMPLETADA' THEN
      v_allowed_results := ARRAY['control_calidad', 'reacondicionado', 'l3', 'scraps'];
      v_expected_origin := 'in_qc';
      v_persist_repairs := true;
    WHEN 'REACONDICIONADO COMPLETADO' THEN
      v_allowed_results := ARRAY['control_calidad', 'reparacion', 'l3', 'scraps'];
      v_expected_origin := 'ready_to_dispatch';
    WHEN 'CONTROL DE CALIDAD COMPLETADO' THEN
      v_allowed_results := ARRAY['listo', 'rechazado_qc'];
      v_expected_origin := 'in_validation';
      IF coalesce(cardinality(v_diag_ids), 0) > 0 THEN
        v_persist_repairs := true;
      END IF;
    WHEN 'REPARACIÓN L3 COMPLETADA' THEN
      v_allowed_results := ARRAY['reparacion', 'scraps'];
      v_expected_origin := 'in_control_warehouse';
      v_persist_repairs := true;
    ELSE
      RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED: Operación de Taller no reconocida: %', v_action
        USING ERRCODE = 'P0001';
  END CASE;

  IF NOT (v_result = ANY (v_allowed_results)) THEN
    RAISE EXCEPTION
      'TRANSITION_NOT_ALLOWED: Resultado "%" no permitido en %. Opciones: %.',
      v_result, v_action, array_to_string(v_allowed_results, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  v_next_status := CASE v_result
    WHEN 'reacondicionado' THEN 'ready_to_dispatch'
    WHEN 'reparacion' THEN 'in_qc'
    WHEN 'control_calidad' THEN 'in_validation'
    WHEN 'l3' THEN 'in_control_warehouse'
    WHEN 'scraps' THEN 'irreparable'
    WHEN 'listo' THEN 'in_central_warehouse'
    WHEN 'rechazado_qc' THEN 'in_qc'
    ELSE 'in_workshop'
  END;

  CREATE TEMP TABLE IF NOT EXISTS _workshop_operate_targets (
    id uuid PRIMARY KEY,
    service_order_id uuid,
    from_status text
  ) ON COMMIT DROP;

  DELETE FROM _workshop_operate_targets WHERE TRUE;

  INSERT INTO _workshop_operate_targets (id, service_order_id, from_status)
  SELECT DISTINCT s.id, s.service_order_id, s.current_status::text
  FROM public.series s
  WHERE s.id = ANY (p_series_ids)
     OR (
       s.service_order_id IS NOT NULL
       AND s.service_order_id IN (
         SELECT DISTINCT s2.service_order_id
         FROM public.series s2
         WHERE s2.id = ANY (p_series_ids)
           AND s2.service_order_id IS NOT NULL
       )
       AND s.current_status IN (
         'in_workshop',
         'in_qc',
         'in_validation',
         'ready_to_dispatch',
         'in_control_warehouse',
         'irreparable',
         'in_central_warehouse'
       )
     );

  SELECT count(*)::integer INTO v_expanded FROM _workshop_operate_targets;
  IF v_expanded = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND: Ninguna serie válida para operar.'
      USING ERRCODE = 'P0001';
  END IF;

  -- G4: lock estable anti-deadlock
  PERFORM 1
  FROM public.series s
  WHERE s.id IN (SELECT t.id FROM _workshop_operate_targets t)
  ORDER BY s.id
  FOR UPDATE;

  UPDATE _workshop_operate_targets t
  SET from_status = s.current_status::text
  FROM public.series s
  WHERE s.id = t.id;

  SELECT t.from_status, t.id
    INTO v_bad_status, v_bad_id
  FROM _workshop_operate_targets t
  WHERE t.from_status IS DISTINCT FROM v_expected_origin
  LIMIT 1;

  IF v_bad_id IS NOT NULL THEN
    RAISE EXCEPTION
      'CONFLICT: serie % en estado "%" ; se esperaba "%" para %.',
      v_bad_id, v_bad_status, v_expected_origin, v_action
      USING ERRCODE = 'P0001';
  END IF;

  -- G1: allowed_outcomes
  IF v_action = 'DIAGNÓSTICO INICIAL COMPLETADO'
     AND v_result IN ('reacondicionado', 'reparacion', 'l3') THEN
    IF coalesce(cardinality(v_diag_ids), 0) = 0 THEN
      RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED: Seleccione al menos un diagnóstico del catálogo.'
        USING ERRCODE = 'P0001';
    END IF;

    WITH diag_raw AS (
      SELECT
        d.id::text AS id,
        CASE
          WHEN d.allowed_outcomes IS NULL OR cardinality(d.allowed_outcomes) = 0
            THEN ARRAY['reparacion', 'l3']::text[]
          ELSE d.allowed_outcomes
        END AS outcomes
      FROM public.cat_diagnostics d
      WHERE d.id::text = ANY (v_diag_ids)
    ),
    classified AS (
      SELECT
        id,
        outcomes,
        (
          cardinality(outcomes) = 1
          AND outcomes = ARRAY['reacondicionado']::text[]
        ) AS reac_only
      FROM diag_raw
    ),
    missing AS (
      SELECT unnest(v_diag_ids) AS id
      EXCEPT
      SELECT id FROM diag_raw
    ),
    repair_sets AS (
      SELECT outcomes FROM classified WHERE NOT reac_only
    ),
    allowed AS (
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM missing) THEN NULL
        WHEN EXISTS (SELECT 1 FROM repair_sets) THEN (
          SELECT ARRAY(
            SELECT e
            FROM (
              SELECT unnest(outcomes) AS e
              FROM repair_sets
              GROUP BY e
              HAVING count(*) = (SELECT count(*) FROM repair_sets)
            ) x
            WHERE e <> 'reacondicionado'
          )
        )
        ELSE (
          SELECT ARRAY(
            SELECT e
            FROM (
              SELECT unnest(outcomes) AS e
              FROM classified
              GROUP BY e
              HAVING count(*) = (SELECT count(*) FROM classified)
            ) x
          )
        )
      END AS outcomes
    )
    SELECT (SELECT outcomes FROM allowed) IS NOT NULL
       AND v_result = ANY (coalesce((SELECT outcomes FROM allowed), '{}'))
      INTO v_outcome_ok;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_diag_ids) AS req(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cat_diagnostics d WHERE d.id::text = req.id
      )
    ) THEN
      RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED: Diagnóstico desconocido en catálogo.'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT coalesce(v_outcome_ok, false) THEN
      RAISE EXCEPTION
        'TRANSITION_NOT_ALLOWED: "%" no aplica a los diagnósticos seleccionados (allowed_outcomes).',
        v_result
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_persist_repairs
     AND v_action IN (
       'REPARACIÓN COMPLETADA',
       'REPARACIÓN L3 COMPLETADA',
       'CONTROL DE CALIDAD COMPLETADO'
     ) THEN
    IF v_action <> 'CONTROL DE CALIDAD COMPLETADO'
       AND coalesce(cardinality(v_diag_ids), 0) = 0 THEN
      RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED: Seleccione al menos una reparación del catálogo.'
        USING ERRCODE = 'P0001';
    END IF;

    IF coalesce(cardinality(v_diag_uuids), 0) > 0 THEN
      IF EXISTS (
        SELECT 1
        FROM unnest(v_diag_uuids) AS rep(id)
        WHERE NOT EXISTS (
          SELECT 1
          FROM _workshop_operate_targets t
          JOIN public.series s ON s.id = t.id
          CROSS JOIN LATERAL unnest(coalesce(s.current_diagnostics, '{}'::uuid[])) AS diag(id)
          JOIN public.cat_diagnostic_repairs cdr
            ON cdr.diagnostic_id = diag.id
           AND cdr.repair_id = rep.id
        )
      ) THEN
        RAISE EXCEPTION
          'TRANSITION_NOT_ALLOWED: Reparación no permitida para el diagnóstico del equipo.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  SELECT ur.role::text INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid
  LIMIT 1;

  -- series.current_status is enum series_status (089 pattern); text assignment fails on real PG.
  UPDATE public.series s
  SET
    current_status = v_next_status::public.series_status,
    current_diagnostics = CASE
      WHEN v_persist_diagnostics THEN v_diag_uuids
      ELSE s.current_diagnostics
    END,
    current_repairs = CASE
      WHEN v_persist_repairs THEN v_diag_uuids
      ELSE s.current_repairs
    END,
    updated_at = now()
  WHERE s.id IN (SELECT t.id FROM _workshop_operate_targets t);

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  IF v_processed <> v_expanded THEN
    RAISE EXCEPTION 'CONFLICT: actualización incompleta (% de %)', v_processed, v_expanded
      USING ERRCODE = 'P0001';
  END IF;

  IF v_persist_repairs AND v_action = 'CONTROL DE CALIDAD COMPLETADO'
     AND coalesce(cardinality(v_diag_ids), 0) > 0 THEN
    INSERT INTO public.erp_audit_logs (
      user_id, user_role, module, table_name, record_id, action, severity, new_values, user_agent
    )
    SELECT
      v_uid,
      coalesce(v_user_role, 'Desconocido'),
      'Taller',
      'series',
      t.id::text,
      'REPARACIÓN CORREGIDA EN QC',
      'INFO'::public.audit_severity,
      jsonb_strip_nulls(jsonb_build_object(
        'repairs', to_jsonb(v_diag_ids),
        'items', to_jsonb(v_diag_ids),
        'operator_name', p_operator_name,
        'source_action', v_action,
        'qc_result', v_result,
        'equipment_complete', true,
        'atomic_tx', true,
        'idempotency_key', p_idempotency_key
      )),
      'rpc/workshop_operate_batch_tx'
    FROM _workshop_operate_targets t;
  END IF;

  INSERT INTO public.erp_audit_logs (
    user_id, user_role, module, table_name, record_id, action, severity, new_values, user_agent
  )
  SELECT
    v_uid,
    coalesce(v_user_role, 'Desconocido'),
    'Taller',
    'series',
    t.id::text,
    v_action,
    'INFO'::public.audit_severity,
    jsonb_strip_nulls(jsonb_build_object(
      'result', v_result,
      'notes', NULLIF(v_notes, ''),
      'nextStatus', v_next_status,
      'fromStatus', t.from_status,
      'operator_name', p_operator_name,
      'diagnostics', CASE WHEN v_persist_diagnostics THEN to_jsonb(v_diag_ids) ELSE NULL END,
      'repairs', CASE WHEN v_persist_repairs THEN to_jsonb(v_diag_ids) ELSE NULL END,
      'items', CASE WHEN v_persist_repairs THEN to_jsonb(v_diag_ids) ELSE NULL END,
      'qc_repair_correction',
        CASE
          WHEN v_action = 'CONTROL DE CALIDAD COMPLETADO' AND coalesce(cardinality(v_diag_ids), 0) > 0
            THEN true
          ELSE NULL
        END,
      'equipment_complete', true,
      'requested_series', v_requested,
      'expanded_series', v_expanded,
      'atomic_tx', true,
      'idempotency_key', p_idempotency_key
    )),
    'rpc/workshop_operate_batch_tx'
  FROM _workshop_operate_targets t;

  GET DIAGNOSTICS v_audit_count = ROW_COUNT;
  IF v_audit_count <> v_expanded THEN
    RAISE EXCEPTION 'CONFLICT: auditoría incompleta (% de %)', v_audit_count, v_expanded
      USING ERRCODE = 'P0001';
  END IF;

  v_out := jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'next_status', v_next_status,
    'requested_series', v_requested,
    'expanded_series', v_expanded
  );

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.workshop_operate_idempotency (
      idempotency_key, operator_id, request_hash, result
    ) VALUES (
      p_idempotency_key, v_uid, v_request_hash, v_out
    );
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.workshop_operate_batch_tx(
  uuid[], text, text, text, text[], uuid, text, uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.workshop_operate_batch_tx(
  uuid[], text, text, text, text[], uuid, text, uuid
) FROM anon;

REVOKE ALL ON FUNCTION public.workshop_operate_batch_tx(
  uuid[], text, text, text, text[], uuid, text, uuid
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.workshop_operate_batch_tx(
  uuid[], text, text, text, text[], uuid, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.workshop_operate_batch_tx(
  uuid[], text, text, text, text[], uuid, text, uuid
) IS
  '289: operate-batch atómico. auth.uid() only; no service_role; '
  'outcomes via cat_diagnostics.allowed_outcomes; idempotency table.';

NOTIFY pgrst, 'reload schema';
