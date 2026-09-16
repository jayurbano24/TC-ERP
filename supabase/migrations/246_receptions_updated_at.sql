-- 246 — receptions.updated_at (despacho / reverso de devoluciones de caja)
BEGIN;

ALTER TABLE public.receptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.receptions.updated_at IS
  'Última modificación del lote (despacho devolución, reverso, sync PX).';

DROP TRIGGER IF EXISTS trg_receptions_updated_at ON public.receptions;
CREATE TRIGGER trg_receptions_updated_at
  BEFORE UPDATE ON public.receptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
