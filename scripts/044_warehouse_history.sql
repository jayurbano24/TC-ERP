-- 044: Historial de Caja
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
      movement_type, 
      source_module, 
      target_module, 
      source_location, 
      target_location, 
      performed_by_name as user_name, 
      created_at as ts,
      created_at as timestamp,
      series_count,
      reason
    FROM public.warehouse_movements
    WHERE box_id = p_box_id
  ) m;
  
  RETURN coalesce(v_history, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_get_box_history(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
