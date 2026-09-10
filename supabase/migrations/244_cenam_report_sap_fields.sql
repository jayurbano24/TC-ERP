-- 244 — CENAM: S1–S4, texto breve SAP (modelo), material y catálogo diagnóstico/reparación
BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_cat_diagnostic_labels(p_ids uuid[])
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    string_agg(DISTINCT upper(trim(d.name)), ', ' ORDER BY upper(trim(d.name))),
    ''
  )
  FROM unnest(coalesce(p_ids, ARRAY[]::uuid[])) AS i(id)
  JOIN public.cat_diagnostics d ON d.id = i.id;
$$;

CREATE OR REPLACE FUNCTION public.resolve_cat_repair_labels(p_ids text[])
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    string_agg(DISTINCT upper(trim(r.name)), ', ' ORDER BY upper(trim(r.name))),
    ''
  )
  FROM unnest(coalesce(p_ids, ARRAY[]::text[])) AS i(id)
  JOIN public.cat_repairs r ON r.id::text = i.id;
$$;

CREATE OR REPLACE FUNCTION public.cenam_sap_brief_text(p_model_name text, p_brand_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(
    nullif(trim(p_model_name), ''),
    nullif(trim(concat(p_brand_name, ' ', p_model_name)), ''),
    'SIN DESCRIPCIÓN'
  ));
$$;

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

  -- Libro 1 — Ingresos (1 fila por OS; S1–S4 se completan en Node con buildEquipmentSerialSlots)
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
      AND NOT EXISTS (SELECT 1 FROM cac_ing c WHERE c.os_id = so.id)
    ORDER BY so.id, so.created_at ASC
  ),
  ing AS (
    SELECT * FROM cac_ing
    UNION ALL
    SELECT * FROM px_ing
  ),
  ing_pick AS (
    SELECT
      i.os_id,
      i.ingreso_at,
      i.canal,
      s.id AS series_id,
      s.serial_number,
      s.model_id,
      s.brand_id,
      row_number() OVER (
        PARTITION BY i.os_id
        ORDER BY
          CASE WHEN lower(coalesce(s.sap_status, '')) = 'validado' THEN 0 ELSE 1 END,
          CASE WHEN coalesce(trim(s.material), '') <> '' THEN 0 ELSE 1 END,
          CASE WHEN coalesce(trim(s.serial_number), '') <> '' THEN 0 ELSE 1 END,
          s.created_at
      ) AS rn
    FROM ing i
    LEFT JOIN public.series s ON s.service_order_id = i.os_id
  ),
  ing_mat AS (
    SELECT service_order_id AS os_id, nullif(trim(max(material)), '') AS material
    FROM public.series
    WHERE service_order_id IN (SELECT os_id FROM ing)
      AND nullif(trim(material), '') IS NOT NULL
    GROUP BY service_order_id
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.ingreso_at, t."_osId"), '[]'::jsonb)
  INTO v_ingresos
  FROM (
    SELECT
      ip.os_id AS "_osId",
      row_number() OVER (ORDER BY ip.ingreso_at, ip.os_id) AS "No.",
      upper(ip.canal) AS "Canal de Ingreso",
      'VIGENTE' AS "ESTADO",
      to_char(ip.ingreso_at AT TIME ZONE 'UTC', 'MM/DD/YYYY') AS "FECHA DE INGRESO TCW",
      upper(coalesce(b.name, '')) AS "MARCA",
      upper(coalesce(m.name, '')) AS "MODELO",
      '' AS "S1",
      '' AS "S2",
      '' AS "S3",
      '' AS "S4",
      upper(coalesce(nullif(trim(ip.serial_number), ''), 'SIN SERIE')) AS "SN",
      '---' AS "MAC",
      coalesce(im.material, '') AS "MATERIAL",
      public.cenam_sap_brief_text(m.name, b.name) AS "Texto breve de material",
      public.normalize_report_tech_name(t.name) AS "TECNOLOGÍA",
      ip.ingreso_at
    FROM ing_pick ip
    LEFT JOIN ing_mat im ON im.os_id = ip.os_id
    LEFT JOIN public.models m ON m.id = ip.model_id
    LEFT JOIN public.brands b ON b.id = coalesce(ip.brand_id, m.brand_id)
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    WHERE ip.rn = 1
  ) t;

  -- Libro 3 — Irreparables
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t._sort_at), '[]'::jsonb)
  INTO v_irreparables
  FROM (
    SELECT
      s.service_order_id AS "_osId",
      upper(coalesce(nullif(trim(s.serial_number), ''), 'S/N')) AS "SN",
      '' AS "S1",
      '' AS "S2",
      '' AS "S3",
      '' AS "S4",
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

  -- Libro 2 — Entregado (diagnóstico/acción desde catálogo, no UUID)
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t._sort), '[]'::jsonb)
  INTO v_entregado
  FROM (
    SELECT DISTINCT ON (so.id)
      so.id AS "_osId",
      upper(coalesce(nullif(trim(s.serial_number), ''), 'SIN SERIE')) AS "NO. DE SERIE",
      '' AS "S1",
      '' AS "S2",
      '' AS "S3",
      '' AS "S4",
      public.cenam_sap_brief_text(m.name, b.name) AS "DESCRIPCIÓN SAP",
      upper(coalesce(b.name, '')) AS "MARCA",
      upper(coalesce(m.name, '')) AS "MODELO",
      public.normalize_report_tech_name(t.name) AS "TECNOLOGÍA",
      CASE WHEN s.current_status::text = 'ready_to_dispatch' THEN 'RC' ELSE 'RP' END AS "TRATAMIENTO",
      upper(coalesce(nullif(trim(s.entry_source), ''), 'cac')) AS "CANAL DE RECUPERACIÓN",
      coalesce(po.po_number, concat('PS - ', p_year::text)) AS "PRODUCCIÓN",
      upper(coalesce(
        nullif(public.resolve_cat_diagnostic_labels(s.current_diagnostics), ''),
        nullif(public.resolve_cat_diagnostic_labels(
          CASE
            WHEN coalesce(trim(diag_audit.diagnostico), '') = '' THEN ARRAY[]::uuid[]
            ELSE string_to_array(replace(diag_audit.diagnostico, ' ', ''), ',')::uuid[]
          END
        ), ''),
        nullif(trim(diag_audit.diagnostico), ''),
        ''
      )) AS "DIAGNÓSTICO",
      upper(coalesce(
        nullif(public.resolve_cat_repair_labels(
          CASE WHEN rep_audit.repair_ids IS NULL THEN ARRAY[]::text[]
          ELSE string_to_array(rep_audit.repair_ids, ',') END
        ), ''),
        nullif(public.resolve_cat_repair_labels(
          CASE WHEN coalesce(trim(rep_audit.accion), '') = '' THEN ARRAY[]::text[]
          ELSE string_to_array(replace(rep_audit.accion, ' ', ''), ',') END
        ), ''),
        nullif(trim(rep_audit.accion), ''),
        ''
      )) AS "ACCIÓN",
      coalesce(
        nullif(trim(s.material), ''),
        (SELECT nullif(trim(s2.material), '')
         FROM public.series s2
         WHERE s2.service_order_id = so.id AND nullif(trim(s2.material), '') IS NOT NULL
         ORDER BY CASE WHEN lower(coalesce(s2.sap_status, '')) = 'validado' THEN 0 ELSE 1 END
         LIMIT 1),
        ''
      ) AS "Material SAP",
      s.updated_at AS _sort
    FROM public.series s
    INNER JOIN public.service_orders so ON so.id = s.service_order_id
    LEFT JOIN public.models m ON m.id = s.model_id
    LEFT JOIN public.brands b ON b.id = coalesce(s.brand_id, m.brand_id)
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    LEFT JOIN public.production_orders po ON po.id = so.production_order_id
    LEFT JOIN LATERAL (
      SELECT coalesce(
        (new_values->>'diagnostics')::text,
        (SELECT string_agg(value::text, ',')
         FROM jsonb_array_elements_text(coalesce(new_values->'diagnostics', '[]'::jsonb)) AS value)
      ) AS diagnostico
      FROM public.erp_audit_logs al
      WHERE al.record_id::text = s.id::text
        AND al.action = 'DIAGNÓSTICO INICIAL COMPLETADO'
      ORDER BY al.created_at DESC
      LIMIT 1
    ) diag_audit ON true
    LEFT JOIN LATERAL (
      SELECT
        (SELECT string_agg(value::text, ',')
         FROM jsonb_array_elements_text(coalesce(al.new_values->'repairs', '[]'::jsonb)) AS value) AS repair_ids,
        (SELECT string_agg(value::text, ', ')
         FROM jsonb_array_elements_text(coalesce(al.new_values->'items', '[]'::jsonb)) AS value) AS accion
      FROM public.erp_audit_logs al
      WHERE al.record_id::text = s.id::text
        AND al.action IN ('REPARACIÓN COMPLETADA', 'REPARACIÓN L3 COMPLETADA', 'REACONDICIONADO COMPLETADO')
      ORDER BY al.created_at DESC
      LIMIT 1
    ) rep_audit ON true
    WHERE s.current_status::text IN ('in_validation', 'in_central_warehouse', 'ready_to_dispatch')
      AND s.updated_at >= v_start
      AND s.updated_at <= v_end
    ORDER BY so.id,
      CASE WHEN lower(coalesce(s.sap_status, '')) = 'validado' THEN 0 ELSE 1 END,
      s.updated_at DESC
  ) t;

  -- Libro 4 — Matriz (sin cambios estructurales)
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
    SELECT public.normalize_report_tech_name(t.name) AS tech, ing.canal, count(DISTINCT ing.os_id) AS cnt
    FROM (
      SELECT DISTINCT ON (ctu.service_order_id) ctu.service_order_id AS os_id, 'cac'::text AS canal
      FROM public.cac_tray_units ctu
      WHERE ctu.is_active AND ctu.service_order_id IS NOT NULL
        AND ctu.classified_at >= v_start AND ctu.classified_at <= v_end
      ORDER BY ctu.service_order_id, ctu.classified_at ASC
      UNION ALL
      SELECT DISTINCT ON (so.id) so.id, 'px'::text
      FROM public.receptions r
      JOIN public.service_orders so ON so.reception_id = r.id
      WHERE lower(r.source) = 'px' AND so.created_at >= v_start AND so.created_at <= v_end
        AND NOT EXISTS (
          SELECT 1 FROM public.cac_tray_units c
          WHERE c.service_order_id = so.id AND c.is_active = true
        )
      ORDER BY so.id, so.created_at ASC
    ) ing
    LEFT JOIN LATERAL (
      SELECT s2.model_id FROM public.series s2
      WHERE s2.service_order_id = ing.os_id
      ORDER BY CASE WHEN coalesce(trim(s2.serial_number), '') <> '' THEN 0 ELSE 1 END, s2.created_at
      LIMIT 1
    ) sp ON true
    LEFT JOIN public.models m ON m.id = sp.model_id
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    GROUP BY 1, 2
  ),
  techs AS (
    SELECT tech FROM recup UNION SELECT tech FROM obs UNION SELECT tech FROM rep UNION SELECT tech FROM rec
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
    SELECT p_year AS "Año", v_country AS "País", ml.mes_label AS "Mes", tg.tech AS "Tecnología",
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
    FROM techs tg CROSS JOIN month_labels ml
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
    'ok', true, 'year', p_year, 'country', v_country, 'month', p_month,
    'ingresos_count', jsonb_array_length(v_ingresos),
    'entregado_count', jsonb_array_length(v_entregado),
    'irreparables_count', jsonb_array_length(v_irreparables),
    'matrix_count', jsonb_array_length(v_matrix),
    'refresh_ms', v_ms, 'refreshed_at', now()
  );
END;
$$;

COMMIT;
