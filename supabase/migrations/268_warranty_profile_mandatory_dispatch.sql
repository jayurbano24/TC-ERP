-- 268 — Perfil de garantía obligatorio al despachar (desde 2026-10-16 GT) + snapshot usa perfil persistido

BEGIN;

CREATE OR REPLACE FUNCTION public.os_status_is_despachado(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(trim(coalesce(p_status, ''))) NOT IN (
      'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
    )
    AND (
      upper(trim(coalesce(p_status, ''))) IN ('DESPACHADO', 'CERRADO')
      OR upper(trim(coalesce(p_status, ''))) LIKE '%DESPACHADO%'
    );
$$;

COMMENT ON FUNCTION public.os_status_is_despachado IS
  'True si la OS cuenta como despachada (Inventario OS / Warranty Pack).';

CREATE OR REPLACE FUNCTION public.warranty_profile_mandatory_from()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT timestamptz '2026-10-16 00:00:00-06';
$$;

CREATE OR REPLACE FUNCTION public.resolve_warranty_profile_for_os(p_service_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH audit_flags AS (
    SELECT
      bool_or(
        upper(coalesce(al.action, '')) LIKE '%REPARACI%N COMPLETADA%'
        OR upper(coalesce(al.action, '')) LIKE '%REPARACION COMPLETADA%'
      ) AS had_repair,
      bool_or(
        upper(coalesce(al.action, '')) LIKE '%CONTROL DE CALIDAD COMPLETADO%'
        OR upper(coalesce(al.action, '')) LIKE '%REACONDICIONADO COMPLETADO%'
        OR upper(coalesce(al.action, '')) LIKE '%REACONDICI%N COMPLETADA%'
      ) AS had_qc_reacond
    FROM public.series s
    JOIN public.erp_audit_logs al ON al.record_id = s.id::text
    WHERE s.service_order_id = p_service_order_id
  )
  SELECT CASE
    WHEN upper(coalesce(p.clase_carcasa, '')) = 'B' THEN 'bueno'
    WHEN coalesce(af.had_repair, false) = false
      AND (
        coalesce(af.had_qc_reacond, false)
        OR coalesce(p.dictamen, '') ILIKE '%reacond%'
      ) THEN 'listo'
    ELSE NULL
  END
  FROM public.prediagnosticos p
  LEFT JOIN audit_flags af ON true
  WHERE p.service_order_id = p_service_order_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_warranty_profile_for_os IS
  'Perfil Listo/Bueno desde prediagnóstico + auditoría (misma regla que Warranty Pack ETL).';

CREATE OR REPLACE FUNCTION public.tg_service_order_warranty_on_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile text;
  v_mandatory timestamptz := public.warranty_profile_mandatory_from();
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.os_status_is_despachado(OLD.status) OR NOT public.os_status_is_despachado(NEW.status) THEN
    RETURN NEW;
  END IF;

  v_profile := coalesce(
    CASE WHEN NEW.warranty_profile IN ('listo', 'bueno') THEN NEW.warranty_profile END,
    public.resolve_warranty_profile_for_os(NEW.id)
  );

  IF now() >= v_mandatory AND v_profile IS NULL THEN
    RAISE EXCEPTION
      'WARRANTY_PROFILE_REQUIRED: Complete prediagnóstico (Equipo Listo o Bueno clase B) antes de despachar. OS %',
      coalesce(NEW.os_label, NEW.id::text);
  END IF;

  IF v_profile IS NOT NULL THEN
    NEW.warranty_profile := v_profile;
    NEW.warranty_basis_dispatch_at := coalesce(NEW.closed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_orders_warranty_on_dispatch ON public.service_orders;
CREATE TRIGGER service_orders_warranty_on_dispatch
  BEFORE UPDATE OF status, closed_at ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_service_order_warranty_on_dispatch();

COMMENT ON TRIGGER service_orders_warranty_on_dispatch ON public.service_orders IS
  'Captura perfil de garantía al pasar a DESPACHADO; bloquea despachos sin perfil desde warranty_profile_mandatory_from().';

-- Snapshot ETL: perfil persistido en OS + fallback resolve (histórico)
CREATE OR REPLACE FUNCTION public.refresh_warranty_pack_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t0 timestamptz := clock_timestamp();
  v_ms int;
  v_rows int;
  v_period_days int := 90;
BEGIN
  PERFORM set_config('statement_timeout', '180000', true);

  TRUNCATE public.warranty_pack_os_snapshot;

  INSERT INTO public.warranty_pack_os_snapshot (
    service_order_id,
    os_label,
    main_serial,
    model_id,
    brand_id,
    technology_id,
    technology_name,
    brand_name,
    model_name,
    dispatched_at,
    warranty_ends_at,
    warranty_profile,
    warranty_status,
    elegible,
    refreshed_at
  )
  WITH dispatched_os AS (
    SELECT
      so.id,
      so.os_label,
      so.main_serial,
      so.model_id,
      so.brand_id,
      so.closed_at,
      so.status,
      so.warranty_profile
    FROM public.service_orders so
    WHERE upper(trim(coalesce(so.status, ''))) NOT IN (
        'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
      )
      AND (
        upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
        OR upper(trim(coalesce(so.status, ''))) LIKE '%DESPACHADO%'
        OR EXISTS (
          SELECT 1 FROM public.series s
          WHERE s.service_order_id = so.id
            AND s.current_status::text = 'dispatched'
        )
      )
  ),
  dispatch_at AS (
    SELECT
      d.id AS service_order_id,
      coalesce(
        (
          SELECT max(coalesce(disp.dispatched_at, di.created_at))
          FROM public.series s
          JOIN public.dispatch_items di ON di.series_id = s.id
          JOIN public.dispatches disp ON disp.id = di.dispatch_id
          WHERE s.service_order_id = d.id
        ),
        d.closed_at
      ) AS dispatched_at
    FROM dispatched_os d
  ),
  enriched AS (
    SELECT
      d.id AS service_order_id,
      d.os_label,
      d.main_serial,
      d.model_id,
      d.brand_id,
      m.technology_id,
      coalesce(t.name, 'Sin tecnología') AS technology_name,
      coalesce(b.name, '—') AS brand_name,
      coalesce(m.name, 'Sin modelo') AS model_name,
      da.dispatched_at,
      coalesce(
        CASE WHEN d.warranty_profile IN ('listo', 'bueno') THEN d.warranty_profile END,
        public.resolve_warranty_profile_for_os(d.id)
      ) AS warranty_profile
    FROM dispatched_os d
    LEFT JOIN dispatch_at da ON da.service_order_id = d.id
    LEFT JOIN public.models m ON m.id = d.model_id
    LEFT JOIN public.brands b ON b.id = coalesce(d.brand_id, m.brand_id)
    LEFT JOIN public.technologies t ON t.id = m.technology_id
  )
  SELECT
    e.service_order_id,
    e.os_label,
    e.main_serial,
    e.model_id,
    e.brand_id,
    e.technology_id,
    e.technology_name,
    e.brand_name,
    e.model_name,
    e.dispatched_at,
    CASE
      WHEN e.dispatched_at IS NOT NULL AND e.warranty_profile IS NOT NULL
        THEN e.dispatched_at + make_interval(days => v_period_days)
      ELSE NULL
    END AS warranty_ends_at,
    e.warranty_profile,
    CASE
      WHEN e.dispatched_at IS NULL OR e.warranty_profile IS NULL THEN 'na'
      WHEN now() <= e.dispatched_at + make_interval(days => v_period_days) THEN 'en_garantia'
      ELSE 'vencida'
    END AS warranty_status,
    (e.warranty_profile IS NOT NULL) AS elegible,
    now()
  FROM enriched e;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_ms := (extract(epoch FROM (clock_timestamp() - v_t0)) * 1000)::int;

  UPDATE public.warranty_pack_meta
  SET refreshed_at = now(), refresh_ms = v_ms, row_count = v_rows
  WHERE id = 1;

  RETURN jsonb_build_object(
    'row_count', v_rows,
    'refresh_ms', v_ms,
    'refreshed_at', now()
  );
END;
$$;

COMMENT ON COLUMN public.service_orders.warranty_profile IS
  'Al despachar: perfil Listo/Bueno capturado en salida. En reingreso garantía: perfil del ciclo anterior.';

COMMIT;
