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

NOTIFY pgrst, 'reload schema';
