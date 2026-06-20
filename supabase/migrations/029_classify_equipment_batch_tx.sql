-- CHG-001: Clasificación batch atómica CAC (sap-transfer)
-- Una transacción PostgreSQL para N equipos; rollback total si falla cualquier unidad.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS reception_guide_id UUID REFERENCES public.reception_guides(id);

CREATE OR REPLACE FUNCTION public.classify_equipment_batch_tx(
  p_reception_id uuid,
  p_sap_transfer_id uuid,
  p_units jsonb,
  p_registered_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sap public.sap_transfer_documents%ROWTYPE;
  v_unit jsonb;
  v_main_serial text;
  v_model_id uuid;
  v_brand_id uuid;
  v_material text;
  v_reentry_count integer;
  v_os_id uuid;
  v_os_rec public.service_orders%ROWTYPE;
  v_sn text;
  v_series_id uuid;
  v_processed integer := 0;
  v_service_orders jsonb := '[]'::jsonb;
  v_series_ids jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  SELECT * INTO v_sap
  FROM public.sap_transfer_documents
  WHERE id = p_sap_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento SAP no encontrado.';
  END IF;

  IF v_sap.reception_id <> p_reception_id THEN
    RAISE EXCEPTION 'El documento SAP no pertenece a la recepción indicada.';
  END IF;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) AS t(value)
  LOOP
    v_main_serial := trim(COALESCE(v_unit->>'main_serial', ''));
    IF v_main_serial = '' THEN
      CONTINUE;
    END IF;

    v_model_id := NULLIF(trim(COALESCE(v_unit->>'model_id', '')), '')::uuid;
    v_brand_id := NULLIF(trim(COALESCE(v_unit->>'brand_id', '')), '')::uuid;
    v_material := NULLIF(trim(COALESCE(v_unit->>'material', '')), '');

    SELECT COUNT(*)::integer INTO v_reentry_count
    FROM public.service_orders
    WHERE main_serial = v_main_serial;

    v_reentry_count := COALESCE(v_reentry_count, 0) + 1;

    INSERT INTO public.service_orders (
      reception_id,
      reception_guide_id,
      sap_transfer_id,
      model_id,
      brand_id,
      main_serial,
      reentry_count,
      status
    ) VALUES (
      p_reception_id,
      v_sap.reception_guide_id,
      p_sap_transfer_id,
      v_model_id,
      v_brand_id,
      v_main_serial,
      v_reentry_count,
      'INGRESADO'
    )
    RETURNING * INTO v_os_rec;

    v_os_id := v_os_rec.id;

    IF v_unit->'all_series' IS NOT NULL AND jsonb_typeof(v_unit->'all_series') = 'array' THEN
      FOR v_sn IN SELECT jsonb_array_elements_text(v_unit->'all_series')
      LOOP
        v_sn := trim(v_sn);
        IF v_sn = '' THEN
          CONTINUE;
        END IF;

        INSERT INTO public.series (
          serial_number,
          current_reception_id,
          service_order_id,
          sap_transfer_id,
          current_status,
          model_id,
          brand_id,
          material,
          updated_at
        ) VALUES (
          v_sn,
          p_reception_id,
          v_os_id,
          p_sap_transfer_id,
          'RECEPCIONADO_BODEGA_GENERAL',
          v_model_id,
          v_brand_id,
          v_material,
          now()
        )
        ON CONFLICT (serial_number) DO UPDATE SET
          current_reception_id = EXCLUDED.current_reception_id,
          service_order_id = EXCLUDED.service_order_id,
          sap_transfer_id = EXCLUDED.sap_transfer_id,
          current_status = EXCLUDED.current_status,
          model_id = EXCLUDED.model_id,
          brand_id = EXCLUDED.brand_id,
          material = COALESCE(EXCLUDED.material, public.series.material),
          updated_at = now()
        RETURNING id INTO v_series_id;

        v_series_ids := v_series_ids || to_jsonb(v_series_id);
      END LOOP;
    END IF;

    v_service_orders := v_service_orders || row_to_json(v_os_rec)::jsonb;
    v_processed := v_processed + 1;
  END LOOP;

  IF v_processed = 0 THEN
    RAISE EXCEPTION 'No hay equipos para clasificar.';
  END IF;

  RETURN jsonb_build_object(
    'service_orders', v_service_orders,
    'series_ids', v_series_ids,
    'registered_by', p_registered_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_equipment_batch_tx(uuid, uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.classify_equipment_batch_tx IS
  'CHG-001: Clasifica N equipos CAC en una transacción atómica (OS + series).';
