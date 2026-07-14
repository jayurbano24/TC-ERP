-- 137: (superseded by 138) Historial caja sin CREATE VIEW.
-- Si 137 falló por 25006 (read-only), ignore y ejecute 138.

CREATE OR REPLACE FUNCTION public.warehouse_get_box_history(p_box_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(m) ORDER BY m.ts DESC)
  INTO v_history
  FROM (
    SELECT
      wm.movement_type,
      wm.source_module,
      wm.target_module,
      wm.source_location,
      wm.target_location,
      coalesce(
        nullif(trim(wm.performed_by_name), ''),
        nullif(trim(p.full_name), ''),
        nullif(trim(p.email), ''),
        'Sistema'
      ) AS user_name,
      wm.performed_by,
      wm.performed_by_name,
      wm.created_at AS ts,
      wm.created_at AS timestamp,
      wm.series_count,
      wm.reason,
      wm.guide_number
    FROM public.warehouse_movements wm
    LEFT JOIN public.profiles p ON p.id = wm.performed_by
    WHERE wm.box_id = p_box_id
  ) m;

  RETURN coalesce(v_history, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_get_box_history(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
