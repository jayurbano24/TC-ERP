-- CHG-015 — Verificación post backfill (reemplazar :T0 con timestamptz acordado)
-- Ejemplo: SET app.t0 = '2026-03-14 06:00:00+00';

-- 1) Elegibles pre-T0 sin prediag (debe → 0 tras apply completo)
SELECT count(*) AS pendientes_pre_t0
FROM public.service_orders so
LEFT JOIN public.prediagnosticos p ON p.service_order_id = so.id
WHERE p.id IS NULL
  AND so.created_at < timestamptz '2026-03-14T06:00:00Z';

-- 2) Mix dictamen backfill
SELECT dictamen, count(*), round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM public.prediagnosticos
WHERE observaciones LIKE '[BACKFILL]%'
GROUP BY 1
ORDER BY 2 DESC;

-- 3) Mix carcasa backfill
SELECT clase_carcasa, count(*)
FROM public.prediagnosticos
WHERE observaciones LIKE '[BACKFILL]%'
GROUP BY 1
ORDER BY 2 DESC;

-- 4) Mediana días ingreso OS → prediag (backfill)
SELECT percentile_cont(0.5) WITHIN GROUP (
  ORDER BY (p.creado_en::date - so.created_at::date)
) AS mediana_dias
FROM public.prediagnosticos p
JOIN public.service_orders so ON so.id = p.service_order_id
WHERE p.observaciones LIKE '[BACKFILL]%';

-- 5) Ningún backfill con OS post-T0
SELECT count(*) AS backfill_post_t0_violations
FROM public.prediagnosticos p
JOIN public.service_orders so ON so.id = p.service_order_id
WHERE p.observaciones LIKE '[BACKFILL]%'
  AND so.created_at >= timestamptz '2026-03-14T06:00:00Z';
