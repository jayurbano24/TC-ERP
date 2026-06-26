-- SEC/TX-02 — create_recepcion_tx: hace atómica la recepción CAC/PX (hexagonal).
--
-- Antes, SupabaseOrdenServicioRepository.save ejecutaba 4+ escrituras separadas sin
-- transacción: upsert log_equipo, upsert log_orden_servicio, insert legacy receptions y
-- inserts en outbox_event. Si una fallaba a mitad quedaban datos parciales (equipo
-- huérfano, o orden persistida sin sus eventos en el outbox). Esta función hace atómicos
-- log_equipo + log_orden_servicio + outbox_event (transactional outbox real: rollback
-- conjunto ante error) y mantiene el dual-write legacy como best-effort.

CREATE OR REPLACE FUNCTION public.create_recepcion_tx(
  p_equipo jsonb,
  p_orden jsonb,
  p_legacy jsonb DEFAULT NULL,
  p_events jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_id text;
BEGIN
  -- 1) Upsert del equipo
  INSERT INTO public.log_equipo (
    id, numero_serie, marca, modelo, tipo_dispositivo, tenant_id, branch_id, updated_at
  ) VALUES (
    p_equipo->>'id',
    p_equipo->>'numero_serie',
    p_equipo->>'marca',
    p_equipo->>'modelo',
    p_equipo->>'tipo_dispositivo',
    p_equipo->>'tenant_id',
    p_equipo->>'branch_id',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    numero_serie = EXCLUDED.numero_serie,
    marca = EXCLUDED.marca,
    modelo = EXCLUDED.modelo,
    tipo_dispositivo = EXCLUDED.tipo_dispositivo,
    updated_at = now();

  -- 2) Upsert de la orden de servicio (atómico con el equipo)
  INSERT INTO public.log_orden_servicio (
    id, tenant_id, branch_id, equipo_id, tipo_recepcion, estado_recepcion,
    diagnostico_inicial, falla_reportada, guia_px, transporte, version, is_deleted, updated_at
  ) VALUES (
    p_orden->>'id',
    p_orden->>'tenant_id',
    p_orden->>'branch_id',
    p_orden->>'equipo_id',
    p_orden->>'tipo_recepcion',
    p_orden->>'estado_recepcion',
    p_orden->>'diagnostico_inicial',
    p_orden->>'falla_reportada',
    p_orden->>'guia_px',
    p_orden->>'transporte',
    coalesce((p_orden->>'version')::int, 1),
    coalesce((p_orden->>'is_deleted')::boolean, false),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    estado_recepcion = EXCLUDED.estado_recepcion,
    diagnostico_inicial = EXCLUDED.diagnostico_inicial,
    falla_reportada = EXCLUDED.falla_reportada,
    guia_px = EXCLUDED.guia_px,
    transporte = EXCLUDED.transporte,
    version = EXCLUDED.version,
    is_deleted = EXCLUDED.is_deleted,
    updated_at = now()
  RETURNING id INTO v_orden_id;

  -- 3) Eventos de dominio al outbox (atómico con la orden: transactional outbox)
  INSERT INTO public.outbox_event (event_name, payload, status)
  SELECT ev->>'event_name', coalesce(ev->'payload', '{}'::jsonb), 'PENDING'
  FROM jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) AS ev
  WHERE ev->>'event_name' IS NOT NULL;

  -- 4) Dual-write legacy (best-effort: su fallo NO aborta la recepción principal)
  IF p_legacy IS NOT NULL THEN
    BEGIN
      INSERT INTO public.receptions (source, guide_number, carrier, received_units, status, notes)
      VALUES (
        p_legacy->>'source',
        p_legacy->>'guide_number',
        p_legacy->>'carrier',
        coalesce((p_legacy->>'received_units')::int, 1),
        coalesce(p_legacy->>'status', 'RECEPCIONADA'),
        p_legacy->>'notes'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_recepcion_tx: dual-write legacy receptions falló (ignorado): %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('orden_id', v_orden_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_recepcion_tx(jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;
