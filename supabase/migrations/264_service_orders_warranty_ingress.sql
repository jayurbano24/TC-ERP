-- 264 — Garantía post-despacho (90 días) y reingresos marcados como Garantía

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS ingress_kind text NOT NULL DEFAULT 'normal'
    CHECK (ingress_kind IN ('normal', 'garantia')),
  ADD COLUMN IF NOT EXISTS warranty_basis_dispatch_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS warranty_basis_os_id uuid NULL
    REFERENCES public.service_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warranty_profile text NULL
    CHECK (warranty_profile IS NULL OR warranty_profile IN ('listo', 'bueno'));

CREATE INDEX IF NOT EXISTS service_orders_ingress_kind_idx
  ON public.service_orders (ingress_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS service_orders_warranty_basis_idx
  ON public.service_orders (warranty_basis_os_id)
  WHERE warranty_basis_os_id IS NOT NULL;

COMMENT ON COLUMN public.service_orders.ingress_kind IS
  'normal | garantia — reingreso dentro de 90 días post-despacho Listo/Bueno.';
COMMENT ON COLUMN public.service_orders.warranty_profile IS
  'Perfil del ciclo anterior: listo (Equipo Listo) o bueno (clase carcasa B).';

INSERT INTO public.report_definitions (code, name, category, description, requires_date_range, columns, is_active)
VALUES (
  'REINGRESO_GARANTIA',
  'Reingreso por garantía',
  'Despacho',
  'Equipos que reingresaron dentro de la ventana de garantía (90 días) tras despacho Listo/Bueno.',
  true,
  '[
    "Fecha ingreso",
    "Orden de Servicio",
    "N° Ingreso",
    "Serie",
    "Marca",
    "Modelo",
    "Tipo ingreso",
    "Perfil despacho",
    "OS despacho anterior",
    "Fecha despacho anterior",
    "Días desde despacho",
    "Vencimiento garantía"
  ]'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  requires_date_range = EXCLUDED.requires_date_range,
  columns = EXCLUDED.columns,
  is_active = EXCLUDED.is_active;
