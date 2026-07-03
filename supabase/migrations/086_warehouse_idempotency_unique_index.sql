-- 086: Índice único en idempotency_key + limpieza de duplicados (doble clic / reintentos).
-- Ejecutar completo en SQL Editor si falló solo el CREATE INDEX.

-- 1) Eliminar movimientos duplicados por idempotency_key.
--    Conserva el registro "mejor": más series, luego el más antiguo.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY idempotency_key
      ORDER BY series_count DESC, created_at ASC, id ASC
    ) AS rn
  FROM public.warehouse_movements
  WHERE idempotency_key IS NOT NULL
)
DELETE FROM public.warehouse_movements wm
USING ranked r
WHERE wm.id = r.id
  AND r.rn > 1;

-- 2) Índice único (requerido para idempotencia en transferencias).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wh_movements_idempotency_key
  ON public.warehouse_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3) Log interno: SELECT previo + manejo de unique_violation (sin ON CONFLICT).
CREATE OR REPLACE FUNCTION public.warehouse_log_movement_internal(
  p_movement_type text,
  p_source_module text,
  p_target_module text,
  p_source_location text,
  p_target_location text,
  p_operator_id uuid,
  p_operator_name text,
  p_box_id uuid,
  p_box_code text,
  p_reception_id uuid,
  p_guide_number text,
  p_series_ids uuid[],
  p_reason text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_rpc_result jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_operator_id uuid := p_operator_id;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_movement_id
    FROM public.warehouse_movements
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN v_movement_id;
    END IF;
  END IF;

  IF v_operator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_operator_id) THEN
    v_operator_id := NULL;
  END IF;

  BEGIN
    INSERT INTO public.warehouse_movements (
      movement_type, source_module, target_module,
      source_location, target_location,
      performed_by, performed_by_name,
      box_id, box_code, reception_id, guide_number,
      series_ids, series_count, reason, idempotency_key, metadata
    ) VALUES (
      p_movement_type, p_source_module, p_target_module,
      p_source_location, p_target_location,
      v_operator_id, p_operator_name,
      p_box_id, p_box_code, p_reception_id, p_guide_number,
      p_series_ids, coalesce(array_length(p_series_ids, 1), 0),
      p_reason, p_idempotency_key,
      CASE WHEN p_rpc_result IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object('rpc_result', p_rpc_result) END
    )
    RETURNING id INTO v_movement_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id
        FROM public.warehouse_movements
        WHERE idempotency_key = p_idempotency_key
        LIMIT 1;
      END IF;
      IF v_movement_id IS NULL THEN
        RAISE;
      END IF;
  END;

  RETURN v_movement_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
