-- Clasificación obligatoria de recepción PX: vigente (Bodega Central) u obsoleta.
ALTER TABLE public.receptions
  ADD COLUMN IF NOT EXISTS inventory_destination text,
  ADD COLUMN IF NOT EXISTS inventory_destination_selected boolean NOT NULL DEFAULT false;

UPDATE public.receptions
SET inventory_destination = 'CENTRAL',
    inventory_destination_selected = true
WHERE inventory_destination IS NULL;

ALTER TABLE public.receptions
  ALTER COLUMN inventory_destination SET DEFAULT 'CENTRAL',
  ALTER COLUMN inventory_destination SET NOT NULL;

ALTER TABLE public.receptions
  DROP CONSTRAINT IF EXISTS receptions_inventory_destination_check;

ALTER TABLE public.receptions
  ADD CONSTRAINT receptions_inventory_destination_check
  CHECK (inventory_destination IN ('CENTRAL', 'OBSOLETE'));

COMMENT ON COLUMN public.receptions.inventory_destination IS
  'Destino único de toda la recepción PX: CENTRAL (vigentes) u OBSOLETE (Bodega de Obsoleto).';

CREATE OR REPLACE FUNCTION public.set_px_reception_destination_tx(
  p_reception_id uuid,
  p_inventory_destination text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.receptions%ROWTYPE;
  v_destination text := upper(trim(coalesce(p_inventory_destination, '')));
  v_equipment_count integer := 0;
BEGIN
  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');

  IF v_destination NOT IN ('CENTRAL', 'OBSOLETE') THEN
    RAISE EXCEPTION 'INVALID_DESTINATION: Seleccione Vigentes u Obsoletos.';
  END IF;

  SELECT * INTO v_rec
  FROM public.receptions
  WHERE id = p_reception_id AND source = 'px'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Recepción PX no encontrada.';
  END IF;

  SELECT count(*)::integer INTO v_equipment_count
  FROM public.px_reception_equipment
  WHERE reception_id = p_reception_id
    AND capture_status IN ('active', 'promoted');

  IF v_equipment_count > 0
     AND v_rec.inventory_destination IS DISTINCT FROM v_destination THEN
    RAISE EXCEPTION 'DESTINATION_LOCKED: La clasificación no puede cambiar después del primer pistoleo.';
  END IF;

  IF v_equipment_count > 0 THEN
    RETURN jsonb_build_object(
      'reception_id', v_rec.id,
      'inventory_destination', v_rec.inventory_destination,
      'locked', true
    );
  END IF;

  -- Si otro operador se unió al mismo SAP con una selección distinta, se rechaza.
  IF v_rec.inventory_destination_selected
     AND v_rec.inventory_destination IS DISTINCT FROM v_destination THEN
    RAISE EXCEPTION 'DESTINATION_MISMATCH: La recepción activa ya fue clasificada con otro destino.';
  END IF;

  UPDATE public.receptions
  SET inventory_destination = v_destination,
      inventory_destination_selected = true,
      version = coalesce(version, 1) + 1
  WHERE id = p_reception_id
  RETURNING * INTO v_rec;

  RETURN jsonb_build_object(
    'reception_id', v_rec.id,
    'inventory_destination', v_rec.inventory_destination,
    'locked', false,
    'version', v_rec.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_px_reception_destination_tx(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_px_reception_destination_tx(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.set_px_reception_destination_tx(uuid, text) IS
  'Define el destino de una recepción PX y lo bloquea después del primer equipo capturado.';

CREATE OR REPLACE FUNCTION public.route_classified_px_reception_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'px'
     AND upper(coalesce(NEW.status, '')) = 'CLASIFICADA'
     AND upper(coalesce(OLD.status, '')) IS DISTINCT FROM 'CLASIFICADA'
     AND NEW.inventory_destination = 'OBSOLETE' THEN
    UPDATE public.boxes
    SET rack_location = 'OBSOLETO',
        updated_at = now()
    WHERE reception_id = NEW.id
      AND rack_location = 'BODEGA_CENTRAL';

    UPDATE public.series
    SET current_status = 'obsolete'::public.series_status,
        updated_at = now()
    WHERE current_reception_id = NEW.id
      AND current_box_id IN (
        SELECT id FROM public.boxes
        WHERE reception_id = NEW.id AND rack_location = 'OBSOLETO'
      );

    INSERT INTO public.erp_audit_logs(module, table_name, record_id, action, user_id, new_values)
    VALUES (
      'recepcion_px',
      'receptions',
      NEW.id::text,
      'INGRESO BODEGA OBSOLETO',
      NEW.received_by,
      jsonb_build_object(
        'inventory_destination', 'OBSOLETE',
        'rack_location', 'OBSOLETO',
        'series_status', 'obsolete'
      )
    );
  END IF;

  IF NEW.source = 'px'
     AND upper(coalesce(NEW.status, '')) = 'CLASIFICADA'
     AND upper(coalesce(OLD.status, '')) IS DISTINCT FROM 'CLASIFICADA'
     AND NEW.inventory_destination = 'CENTRAL' THEN
    UPDATE public.series
    SET current_status = 'in_central_warehouse'::public.series_status,
        updated_at = now()
    WHERE current_reception_id = NEW.id
      AND current_box_id IN (
        SELECT id FROM public.boxes
        WHERE reception_id = NEW.id AND rack_location = 'BODEGA_CENTRAL'
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_classified_px_reception_to_inventory ON public.receptions;
CREATE TRIGGER trg_route_classified_px_reception_to_inventory
AFTER UPDATE OF status ON public.receptions
FOR EACH ROW
EXECUTE FUNCTION public.route_classified_px_reception_to_inventory();

COMMENT ON FUNCTION public.route_classified_px_reception_to_inventory() IS
  'En la misma transacción de finalize PX mueve cajas y series obsoletas a OBSOLETO/obsolete; las vigentes permanecen en BODEGA_CENTRAL/in_central_warehouse.';
