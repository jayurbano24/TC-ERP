-- 243 — ETL snapshot CENAM Refurbished (evita hang / muchas round-trips desde Node)
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_report_tech_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN upper(coalesce(trim(p_name), '')) ~ '(ADSL|XDSL)|^DSL$' THEN 'ADSL'
    WHEN upper(coalesce(trim(p_name), '')) LIKE '%EMTA%' THEN 'EMTA'
    WHEN upper(coalesce(trim(p_name), '')) ~ '(STB|HFC)' THEN 'STB'
    WHEN upper(coalesce(trim(p_name), '')) LIKE '%IPTV%' THEN 'IPTV'
    WHEN upper(coalesce(trim(p_name), '')) ~ '(WTTH|WTTX)' THEN 'WTTH'
    WHEN upper(coalesce(trim(p_name), '')) LIKE '%DTH%' THEN 'DTH'
    WHEN upper(coalesce(trim(p_name), '')) ~ '(GPON|ONT)' THEN 'GPON'
    WHEN upper(coalesce(trim(p_name), '')) ~ '(IFI|WIFI|WI-FI)' THEN 'IFI'
    WHEN coalesce(trim(p_name), '') = '' THEN 'SIN TECNOLOGÍA'
    ELSE upper(trim(p_name))
  END;
$$;

CREATE TABLE IF NOT EXISTS public.cenam_report_snapshot (
  report_year     int  NOT NULL,
  report_country  text NOT NULL,
  report_month    int  NOT NULL CHECK (report_month BETWEEN 1 AND 12),
  ingresos        jsonb NOT NULL DEFAULT '[]'::jsonb,
  entregado       jsonb NOT NULL DEFAULT '[]'::jsonb,
  irreparables    jsonb NOT NULL DEFAULT '[]'::jsonb,
  matrix          jsonb NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at    timestamptz NOT NULL DEFAULT now(),
  refresh_ms      int,
  PRIMARY KEY (report_year, report_country, report_month)
);

ALTER TABLE public.cenam_report_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cenam_report_snapshot_select ON public.cenam_report_snapshot;
CREATE POLICY cenam_report_snapshot_select
  ON public.cenam_report_snapshot FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.cenam_report_snapshot TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_cenam_report_snapshot(
  p_year int,
  p_country text,
  p_month int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_country text := upper(trim(coalesce(p_country, 'GT')));
  v_ingresos jsonb := '[]'::jsonb;
  v_entregado jsonb := '[]'::jsonb;
  v_irreparables jsonb := '[]'::jsonb;
  v_matrix jsonb := '[]'::jsonb;
  v_t0 timestamptz := clock_timestamp();
  v_ms int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Año inválido';
  END IF;
  IF p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Mes requerido (1-12)';
  END IF;

  PERFORM set_config('statement_timeout', '180000', true);

  v_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  v_end := (date_trunc('month', v_start) + interval '1 month' - interval '1 microsecond');

  -- Libro 1 — Ingresos PX/CAC (1 fila por OS)
  WITH cac_ing AS (
    SELECT DISTINCT ON (ctu.service_order_id)
      ctu.service_order_id AS os_id,
      ctu.classified_at AS ingreso_at,
      'cac'::text AS canal
    FROM public.cac_tray_units ctu
    WHERE ctu.is_active = true
      AND ctu.service_order_id IS NOT NULL
      AND ctu.classified_at >= v_start
      AND ctu.classified_at <= v_end
    ORDER BY ctu.service_order_id, ctu.classified_at ASC
  ),
  px_ing AS (
    SELECT DISTINCT ON (so.id)
      so.id AS os_id,
      so.created_at AS ingreso_at,
      'px'::text AS canal
    FROM public.receptions r
    INNER JOIN public.service_orders so ON so.reception_id = r.id
    WHERE lower(coalesce(r.source, '')) = 'px'
      AND so.created_at >= v_start
      AND so.created_at <= v_end
      AND NOT EXISTS (
        SELECT 1 FROM cac_ing c WHERE c.os_id = so.id
      )
    ORDER BY so.id, so.created_at ASC
  ),
  ing AS (
    SELECT * FROM cac_ing
    UNION ALL
    SELECT * FROM px_ing
  ),
  ing_series AS (
    SELECT
      i.os_id,
      i.ingreso_at,
      i.canal,
      s.id AS series_id,
      s.serial_number,
      s.s2,
      s.s3,
      s.s4,
      s.material,
      s.valuation,
      s.model_id,
      s.brand_id,
      row_number() OVER (
        PARTITION BY i.os_id
        ORDER BY CASE WHEN coalesce(trim(s.serial_number), '') <> '' THEN 0 ELSE 1 END, s.created_at
      ) AS rn
    FROM ing i
    LEFT JOIN public.series s ON s.service_order_id = i.os_id
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.ingreso_at, t.os_id), '[]'::jsonb)
  INTO v_ingresos
  FROM (
    SELECT
      row_number() OVER (ORDER BY is2.ingreso_at, is2.os_id) AS "No.",
      upper(is2.canal) AS "Canal de Ingreso",
      'VIGENTE' AS "ESTADO",
      to_char(is2.ingreso_at AT TIME ZONE 'UTC', 'MM/DD/YYYY') AS "FECHA DE INGRESO TCW",
      upper(coalesce(b.name, '')) AS "MARCA",
      upper(coalesce(m.name, '')) AS "MODELO",
      upper(coalesce(nullif(trim(is2.serial_number), ''), 'SIN SERIE')) AS "SN",
      '---' AS "MAC",
      coalesce(trim(is2.material), '') AS "MATERIAL",
      upper(coalesce(nullif(trim(is2.valuation), ''), concat(
        public.normalize_report_tech_name(t.name),
        ' ',
        coalesce(b.name, ''),
        ' ',
        coalesce(m.name, '')
      ))) AS "Texto breve de material",
      public.normalize_report_tech_name(t.name) AS "TECNOLOGÍA"
    FROM ing_series is2
    LEFT JOIN public.models m ON m.id = is2.model_id
    LEFT JOIN public.brands b ON b.id = coalesce(is2.brand_id, m.brand_id)
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    WHERE is2.rn = 1 OR is2.series_id IS NULL
  ) t;

  -- Libro 3 — Irreparables del mes
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t._sort_at), '[]'::jsonb)
  INTO v_irreparables
  FROM (
    SELECT
      upper(coalesce(nullif(trim(s.serial_number), ''), 'S/N')) AS "SN",
      upper(coalesce(nullif(trim(s.s2), ''), '---')) AS "CASN",
      public.normalize_report_tech_name(t.name) AS "TECNOLOGÍA",
      upper(coalesce(m.name, '---')) AS "MODELO",
      upper(coalesce(rg.agency, '---')) AS "SUCURSAL SN",
      upper(coalesce(
        nullif(trim(substring(coalesce(al.new_values->>'notes', '') from 1 for 500)), ''),
        'IRREPARABLE'
      )) AS "FALLA",
      s.updated_at AS _sort_at
    FROM public.series s
    LEFT JOIN public.service_orders so ON so.id = s.service_order_id
    LEFT JOIN public.reception_guides rg ON rg.id = so.reception_guide_id
    LEFT JOIN public.models m ON m.id = s.model_id
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    LEFT JOIN LATERAL (
      SELECT new_values
      FROM public.erp_audit_logs al
      WHERE al.table_name = 'series'
        AND al.record_id::text = s.id::text
        AND al.action IN (
          'DIAGNÓSTICO INICIAL COMPLETADO',
          'REPARACIÓN COMPLETADA',
          'REACONDICIONADO COMPLETADO',
          'REPARACIÓN L3 COMPLETADA',
          'CONTROL DE CALIDAD COMPLETADO'
        )
        AND coalesce(al.new_values->>'result', '') = 'scraps'
      ORDER BY al.created_at DESC
      LIMIT 1
    ) al ON true
    WHERE s.current_status = 'irreparable'::public.series_status
      AND s.updated_at >= v_start
      AND s.updated_at <= v_end
  ) t;

  -- Libro 2 — Entregado (RP/RC) snapshot del mes
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t._sort), '[]'::jsonb)
  INTO v_entregado
  FROM (
    SELECT DISTINCT ON (so.id)
      upper(coalesce(nullif(trim(s.serial_number), ''), 'SIN SERIE')) AS "NO. DE SERIE",
      upper(coalesce(nullif(trim(s.valuation), ''), concat(
        public.normalize_report_tech_name(t.name), ' ', coalesce(b.name, ''), ' ', coalesce(m.name, '')
      ))) AS "DESCRIPCIÓN SAP",
      upper(coalesce(b.name, '')) AS "MARCA",
      upper(coalesce(m.name, '')) AS "MODELO",
      public.normalize_report_tech_name(t.name) AS "TECNOLOGÍA",
      CASE
        WHEN s.current_status::text = 'ready_to_dispatch' THEN 'RC'
        ELSE 'RP'
      END AS "TRATAMIENTO",
      upper(coalesce(nullif(trim(s.entry_source), ''), 'cac')) AS "CANAL DE RECUPERACIÓN",
      coalesce(po.po_number, concat('PS - ', p_year::text)) AS "PRODUCCIÓN",
      '' AS "DIAGNÓSTICO",
      '' AS "ACCIÓN",
      coalesce(trim(s.material), '') AS "Material SAP",
      s.updated_at AS _sort
    FROM public.series s
    INNER JOIN public.service_orders so ON so.id = s.service_order_id
    LEFT JOIN public.models m ON m.id = s.model_id
    LEFT JOIN public.brands b ON b.id = coalesce(s.brand_id, m.brand_id)
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    LEFT JOIN public.production_orders po ON po.id = so.production_order_id
    WHERE s.current_status::text IN ('in_validation', 'in_central_warehouse', 'ready_to_dispatch')
      AND s.updated_at >= v_start
      AND s.updated_at <= v_end
    ORDER BY so.id, s.updated_at DESC
  ) t;

  -- Libro 4 — Matriz resumen
  WITH obs AS (
    SELECT public.normalize_report_tech_name(t.name) AS tech,
           upper(coalesce(nullif(trim(s.entry_source), ''), 'cac')) AS canal,
           count(DISTINCT s.service_order_id) AS cnt
    FROM public.series s
    LEFT JOIN public.models m ON m.id = s.model_id
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    WHERE s.current_status = 'obsolete'::public.series_status
      AND s.updated_at >= v_start AND s.updated_at <= v_end
    GROUP BY 1, 2
  ),
  rep AS (
    SELECT public.normalize_report_tech_name(t.name) AS tech,
           upper(coalesce(nullif(trim(s.entry_source), ''), 'cac')) AS canal,
           count(DISTINCT s.service_order_id) AS cnt
    FROM public.series s
    LEFT JOIN public.models m ON m.id = s.model_id
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    WHERE s.current_status::text IN ('in_validation', 'in_central_warehouse')
      AND s.updated_at >= v_start AND s.updated_at <= v_end
    GROUP BY 1, 2
  ),
  rec AS (
    SELECT public.normalize_report_tech_name(t.name) AS tech,
           upper(coalesce(nullif(trim(s.entry_source), ''), 'cac')) AS canal,
           count(DISTINCT s.service_order_id) AS cnt
    FROM public.series s
    LEFT JOIN public.models m ON m.id = s.model_id
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    WHERE s.current_status::text = 'ready_to_dispatch'
      AND s.updated_at >= v_start AND s.updated_at <= v_end
    GROUP BY 1, 2
  ),
  recup AS (
    SELECT
      public.normalize_report_tech_name(t.name) AS tech,
      ing.canal,
      count(DISTINCT ing.os_id) AS cnt
    FROM (
      SELECT DISTINCT ON (ctu.service_order_id)
        ctu.service_order_id AS os_id,
        'cac'::text AS canal
      FROM public.cac_tray_units ctu
      WHERE ctu.is_active AND ctu.service_order_id IS NOT NULL
        AND ctu.classified_at >= v_start AND ctu.classified_at <= v_end
      ORDER BY ctu.service_order_id, ctu.classified_at ASC
      UNION ALL
      SELECT DISTINCT ON (so.id)
        so.id AS os_id,
        'px'::text AS canal
      FROM public.receptions r
      JOIN public.service_orders so ON so.reception_id = r.id
      WHERE lower(r.source) = 'px'
        AND so.created_at >= v_start AND so.created_at <= v_end
        AND NOT EXISTS (
          SELECT 1 FROM public.cac_tray_units c
          WHERE c.service_order_id = so.id AND c.is_active = true
        )
      ORDER BY so.id, so.created_at ASC
    ) ing
    LEFT JOIN LATERAL (
      SELECT s2.model_id, s2.entry_source
      FROM public.series s2
      WHERE s2.service_order_id = ing.os_id
      ORDER BY CASE WHEN coalesce(trim(s2.serial_number), '') <> '' THEN 0 ELSE 1 END, s2.created_at
      LIMIT 1
    ) s ON true
    LEFT JOIN public.models m ON m.id = s.model_id
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    GROUP BY 1, 2
  ),
  techs AS (
    SELECT tech FROM recup
    UNION SELECT tech FROM obs
    UNION SELECT tech FROM rep
    UNION SELECT tech FROM rec
  ),
  month_labels AS (
    SELECT CASE p_month
      WHEN 1 THEN 'ENE' WHEN 2 THEN 'FEB' WHEN 3 THEN 'MAR' WHEN 4 THEN 'ABR'
      WHEN 5 THEN 'MAY' WHEN 6 THEN 'JUN' WHEN 7 THEN 'JUL' WHEN 8 THEN 'AGO'
      WHEN 9 THEN 'SEP' WHEN 10 THEN 'OCT' WHEN 11 THEN 'NOV' WHEN 12 THEN 'DIC'
    END AS mes_label
  )
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x."Tecnología"), '[]'::jsonb)
  INTO v_matrix
  FROM (
    SELECT
      p_year AS "Año",
      v_country AS "País",
      ml.mes_label AS "Mes",
      tg.tech AS "Tecnología",
      nullif((SELECT coalesce(sum(r2.cnt), 0) FROM recup r2 WHERE r2.tech = tg.tech AND r2.canal = 'CAC'), 0) AS "Recuperados CACs",
      nullif((SELECT coalesce(sum(r2.cnt), 0) FROM recup r2 WHERE r2.tech = tg.tech AND r2.canal = 'PX'), 0) AS "Recuperados PX",
      NULL::int AS "Recuperados Mora",
      nullif((SELECT coalesce(sum(o2.cnt), 0) FROM obs o2 WHERE o2.tech = tg.tech AND o2.canal = 'CAC'), 0) AS "Obsoleto CACs",
      nullif((SELECT coalesce(sum(o2.cnt), 0) FROM obs o2 WHERE o2.tech = tg.tech AND o2.canal = 'PX'), 0) AS "Obsoleto PX",
      NULL::int AS "Obsoleto Mora",
      nullif((SELECT coalesce(sum(rp2.cnt), 0) FROM rep rp2 WHERE rp2.tech = tg.tech AND rp2.canal = 'CAC'), 0) AS "Reparado CACs",
      nullif((SELECT coalesce(sum(rp2.cnt), 0) FROM rep rp2 WHERE rp2.tech = tg.tech AND rp2.canal = 'PX'), 0) AS "Reparado PX",
      NULL::int AS "Reparado Mora",
      nullif((SELECT coalesce(sum(rc2.cnt), 0) FROM rec rc2 WHERE rc2.tech = tg.tech AND rc2.canal = 'CAC'), 0) AS "Reacondicionado CACs",
      nullif((SELECT coalesce(sum(rc2.cnt), 0) FROM rec rc2 WHERE rc2.tech = tg.tech AND rc2.canal = 'PX'), 0) AS "Reacondicionado PX",
      NULL::int AS "Reacondicionado Mora"
    FROM techs tg
    CROSS JOIN month_labels ml
  ) x;

  INSERT INTO public.cenam_report_snapshot (
    report_year, report_country, report_month,
    ingresos, entregado, irreparables, matrix, refreshed_at, refresh_ms
  )
  VALUES (
    p_year, v_country, p_month,
    v_ingresos, v_entregado, v_irreparables, v_matrix, now(),
    (extract(epoch FROM (clock_timestamp() - v_t0)) * 1000)::int
  )
  ON CONFLICT (report_year, report_country, report_month) DO UPDATE SET
    ingresos = EXCLUDED.ingresos,
    entregado = EXCLUDED.entregado,
    irreparables = EXCLUDED.irreparables,
    matrix = EXCLUDED.matrix,
    refreshed_at = EXCLUDED.refreshed_at,
    refresh_ms = EXCLUDED.refresh_ms;

  v_ms := (extract(epoch FROM (clock_timestamp() - v_t0)) * 1000)::int;

  RETURN jsonb_build_object(
    'ok', true,
    'year', p_year,
    'country', v_country,
    'month', p_month,
    'ingresos_count', jsonb_array_length(v_ingresos),
    'entregado_count', jsonb_array_length(v_entregado),
    'irreparables_count', jsonb_array_length(v_irreparables),
    'matrix_count', jsonb_array_length(v_matrix),
    'refresh_ms', v_ms,
    'refreshed_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cenam_report_snapshot(
  p_year int,
  p_country text,
  p_month int,
  p_max_age_minutes int DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cenam_report_snapshot%ROWTYPE;
  v_country text := upper(trim(coalesce(p_country, 'GT')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.cenam_report_snapshot s
  WHERE s.report_year = p_year
    AND s.report_country = v_country
    AND s.report_month = p_month;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stale', true, 'reason', 'missing');
  END IF;

  IF v_row.refreshed_at < now() - make_interval(mins => greatest(coalesce(p_max_age_minutes, 120), 1)) THEN
    RETURN jsonb_build_object(
      'stale', true,
      'reason', 'expired',
      'refreshed_at', v_row.refreshed_at
    );
  END IF;

  RETURN jsonb_build_object(
    'stale', false,
    'refreshed_at', v_row.refreshed_at,
    'refresh_ms', v_row.refresh_ms,
    'ingresos', v_row.ingresos,
    'entregado', v_row.entregado,
    'irreparables', v_row.irreparables,
    'matrix', v_row.matrix
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_cenam_report_snapshot(int, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cenam_report_snapshot(int, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_cenam_report_snapshot(int, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cenam_report_snapshot(int, text, int, int) TO authenticated;

COMMIT;
