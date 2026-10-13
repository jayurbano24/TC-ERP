-- 254 — Pre-diagnóstico en captura PX (por equipo, antes de OS) + copia al promover.

CREATE TABLE IF NOT EXISTS public.px_equipment_prediagnosticos (
  equipment_id uuid PRIMARY KEY REFERENCES public.px_reception_equipment(id) ON DELETE CASCADE,
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

ALTER TABLE public.px_equipment_prediagnosticos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS px_equipment_prediagnosticos_read ON public.px_equipment_prediagnosticos;
CREATE POLICY px_equipment_prediagnosticos_read ON public.px_equipment_prediagnosticos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS px_equipment_prediagnosticos_write ON public.px_equipment_prediagnosticos;
CREATE POLICY px_equipment_prediagnosticos_write ON public.px_equipment_prediagnosticos
  FOR ALL TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.px_equipment_prediagnosticos TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_copy_px_equipment_prediagnostico_to_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.promoted_service_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.promoted_service_order_id IS NOT DISTINCT FROM NEW.promoted_service_order_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.prediagnosticos (
    service_order_id,
    clase_carcasa,
    detalles_cosmeticos,
    funcionamiento,
    dictamen,
    observaciones,
    creado_por,
    creado_por_nombre,
    creado_en,
    actualizado_por,
    actualizado_por_nombre,
    actualizado_en
  )
  SELECT
    NEW.promoted_service_order_id,
    p.clase_carcasa,
    p.detalles_cosmeticos,
    p.funcionamiento,
    p.dictamen,
    p.observaciones,
    p.creado_por,
    p.creado_por_nombre,
    p.creado_en,
    p.actualizado_por,
    p.actualizado_por_nombre,
    p.actualizado_en
  FROM public.px_equipment_prediagnosticos p
  WHERE p.equipment_id = NEW.id
  ON CONFLICT (service_order_id) DO UPDATE SET
    clase_carcasa = EXCLUDED.clase_carcasa,
    detalles_cosmeticos = EXCLUDED.detalles_cosmeticos,
    funcionamiento = EXCLUDED.funcionamiento,
    dictamen = EXCLUDED.dictamen,
    observaciones = EXCLUDED.observaciones,
    actualizado_por = EXCLUDED.actualizado_por,
    actualizado_por_nombre = EXCLUDED.actualizado_por_nombre,
    actualizado_en = EXCLUDED.actualizado_en;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS px_equipment_prediagnostico_promote ON public.px_reception_equipment;
CREATE TRIGGER px_equipment_prediagnostico_promote
  AFTER UPDATE OF promoted_service_order_id ON public.px_reception_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_copy_px_equipment_prediagnostico_to_os();

NOTIFY pgrst, 'reload schema';
