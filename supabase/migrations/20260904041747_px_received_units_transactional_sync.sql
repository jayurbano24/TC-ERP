-- PX: received_units deja de depender del side effect asíncrono de Next.js.
-- Solo equipos aceptados (active/promoted) cuentan; rechazos nunca llegan a
-- px_reception_equipment y por tanto no pueden incrementar este contador.

CREATE OR REPLACE FUNCTION public.trg_px_sync_received_units()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reception_id uuid;
BEGIN
  FOR v_reception_id IN
    SELECT DISTINCT id
    FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.reception_id ELSE NULL END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.reception_id ELSE NULL END
    ]) AS ids(id)
    WHERE id IS NOT NULL
  LOOP
    UPDATE public.receptions r
    SET received_units = (
      SELECT count(*)::integer
      FROM public.px_reception_equipment e
      WHERE e.reception_id = v_reception_id
        AND e.capture_status IN ('active', 'promoted')
    )
    WHERE r.id = v_reception_id
      AND r.source::text = 'px';
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.trg_px_sync_received_units() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_px_sync_received_units
  ON public.px_reception_equipment;
CREATE TRIGGER trg_px_sync_received_units
  AFTER INSERT OR DELETE OR UPDATE OF capture_status, reception_id
  ON public.px_reception_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_px_sync_received_units();

-- Corrige cualquier deriva previa únicamente en recepciones operativas.
UPDATE public.receptions r
SET received_units = (
  SELECT count(*)::integer
  FROM public.px_reception_equipment e
  WHERE e.reception_id = r.id
    AND e.capture_status IN ('active', 'promoted')
)
WHERE r.source::text = 'px'
  AND upper(coalesce(r.status, '')) IN (
    'EN_PROCESO', 'BORRADOR', 'LISTA_PARA_FINALIZAR', 'FINALIZANDO'
  );

NOTIFY pgrst, 'reload schema';
