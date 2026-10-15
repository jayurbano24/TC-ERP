-- =============================================================================
-- Pre-diagnóstico CAC + backfill CHG-015
-- Ejecutar en Supabase → SQL Editor (en este orden: 251 → 253 → 255)
-- Origen: web/supabase/migrations/251_prediagnostico.sql
--         web/supabase/migrations/253_prediagnostico_model_items.sql
--         web/supabase/migrations/255_prediagnostico_backfill_candidates.sql
-- =============================================================================

-- ---------- 251 ----------
-- 251 — Prediagnóstico CAC (1 a 1 con la orden de servicio) y catálogo por tecnología/marca.

CREATE TABLE IF NOT EXISTS public.cat_prediagnostico_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('cosmetico', 'funcionamiento')),
  technology_ids uuid[] NOT NULL DEFAULT '{}',
  brand_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prediagnosticos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE CASCADE,
  clase_carcasa text NOT NULL CHECK (clase_carcasa IN ('A', 'B', 'C', 'D')),
  detalles_cosmeticos jsonb NOT NULL DEFAULT '{}'::jsonb,
  funcionamiento jsonb NOT NULL DEFAULT '{}'::jsonb,
  dictamen text NOT NULL CHECK (dictamen IN ('reacondicionado', 'reparado', 'irreparable')),
  observaciones text,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid,
  actualizado_por_nombre text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prediagnosticos_dictamen_idx ON public.prediagnosticos (dictamen);
CREATE INDEX IF NOT EXISTS prediagnosticos_clase_idx ON public.prediagnosticos (clase_carcasa);

CREATE TABLE IF NOT EXISTS public.prediagnostico_revisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediagnostico_id uuid NOT NULL REFERENCES public.prediagnosticos(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL,
  clase_carcasa text NOT NULL,
  detalles_cosmeticos jsonb NOT NULL,
  funcionamiento jsonb NOT NULL,
  dictamen text NOT NULL,
  observaciones text,
  editado_por uuid,
  editado_por_nombre text,
  editado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prediagnostico_revisiones_os_idx
  ON public.prediagnostico_revisiones (service_order_id, editado_en DESC);

ALTER TABLE public.cat_prediagnostico_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediagnosticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediagnostico_revisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cat_prediagnostico_items_read ON public.cat_prediagnostico_items;
CREATE POLICY cat_prediagnostico_items_read ON public.cat_prediagnostico_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cat_prediagnostico_items_write ON public.cat_prediagnostico_items;
CREATE POLICY cat_prediagnostico_items_write ON public.cat_prediagnostico_items
  FOR ALL TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  );

DROP POLICY IF EXISTS prediagnosticos_read ON public.prediagnosticos;
CREATE POLICY prediagnosticos_read ON public.prediagnosticos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS prediagnosticos_write ON public.prediagnosticos;
CREATE POLICY prediagnosticos_write ON public.prediagnosticos
  FOR ALL TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  );

DROP POLICY IF EXISTS prediagnostico_revisiones_read ON public.prediagnostico_revisiones;
CREATE POLICY prediagnostico_revisiones_read ON public.prediagnostico_revisiones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS prediagnostico_revisiones_insert ON public.prediagnostico_revisiones;
CREATE POLICY prediagnostico_revisiones_insert ON public.prediagnostico_revisiones
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cat_prediagnostico_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prediagnosticos TO authenticated, service_role;
GRANT SELECT, INSERT ON public.prediagnostico_revisiones TO authenticated, service_role;

INSERT INTO public.cat_prediagnostico_items (name, item_kind, sort_order)
SELECT v.name, v.item_kind, v.sort_order
FROM (
  VALUES
    ('Puertos', 'cosmetico', 10),
    ('Etiqueta', 'cosmetico', 20),
    ('Antenas', 'cosmetico', 30),
    ('Base/soporte', 'cosmetico', 40),
    ('Enciende', 'funcionamiento', 10),
    ('LEDs', 'funcionamiento', 20),
    ('Puertos Ethernet', 'funcionamiento', 30),
    ('WiFi', 'funcionamiento', 40),
    ('Reset', 'funcionamiento', 50)
) AS v(name, item_kind, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cat_prediagnostico_items existing WHERE existing.name = v.name
);

-- ---------- 253 ----------
-- 253 — Perfil de ítems de pre-diagnóstico por modelo (allowlist opcional).

CREATE TABLE IF NOT EXISTS public.cat_prediagnostico_model_items (
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.cat_prediagnostico_items(id) ON DELETE CASCADE,
  PRIMARY KEY (model_id, item_id)
);

CREATE INDEX IF NOT EXISTS cat_prediagnostico_model_items_model_idx
  ON public.cat_prediagnostico_model_items (model_id);

ALTER TABLE public.cat_prediagnostico_model_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cat_prediagnostico_model_items_read ON public.cat_prediagnostico_model_items;
CREATE POLICY cat_prediagnostico_model_items_read ON public.cat_prediagnostico_model_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cat_prediagnostico_model_items_write ON public.cat_prediagnostico_model_items;
CREATE POLICY cat_prediagnostico_model_items_write ON public.cat_prediagnostico_model_items
  FOR ALL TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cat_prediagnostico_model_items TO authenticated, service_role;

-- ---------- 255 ----------
-- 255 — RPC candidatos backfill pre-diagnóstico (CHG-015 Fase 1).

CREATE OR REPLACE FUNCTION public.list_prediagnostico_backfill_candidates(
  p_cutoff timestamptz,
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  service_order_id uuid,
  serial_number text,
  model_id uuid,
  brand_id uuid,
  technology_id uuid,
  ingress_at timestamptz,
  current_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    so.id AS service_order_id,
    COALESCE(
      NULLIF(trim(so.main_serial), ''),
      (
        SELECT s.serial_number
        FROM public.series s
        WHERE s.service_order_id = so.id
        ORDER BY s.created_at ASC NULLS LAST
        LIMIT 1
      )
    ) AS serial_number,
    so.model_id,
    COALESCE(so.brand_id, m.brand_id) AS brand_id,
    m.technology_id,
    so.created_at AS ingress_at,
    (
      SELECT s.current_status::text
      FROM public.series s
      WHERE s.service_order_id = so.id
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1
    ) AS current_status
  FROM public.service_orders so
  INNER JOIN public.models m ON m.id = so.model_id
  LEFT JOIN public.prediagnosticos p ON p.service_order_id = so.id
  WHERE p.id IS NULL
    AND so.created_at < p_cutoff
    AND so.model_id IS NOT NULL
    AND m.technology_id IS NOT NULL
  ORDER BY so.created_at ASC, so.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

COMMENT ON FUNCTION public.list_prediagnostico_backfill_candidates IS
  'OS sin prediagnóstico, pre-cutoff, con modelo/tecnología — paginado para backfill CHG-015.';

GRANT EXECUTE ON FUNCTION public.list_prediagnostico_backfill_candidates(timestamptz, int, int)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------- Verificación ----------
SELECT 'cat_prediagnostico_items' AS objeto, count(*)::text AS n FROM public.cat_prediagnostico_items
UNION ALL
SELECT 'prediagnosticos', count(*)::text FROM public.prediagnosticos
UNION ALL
SELECT 'cat_prediagnostico_model_items', count(*)::text FROM public.cat_prediagnostico_model_items;

-- Muestra de candidatos backfill (ajusta T0):
-- SELECT count(*) FROM public.list_prediagnostico_backfill_candidates('2026-03-14T06:00:00Z'::timestamptz, 500, 0);
