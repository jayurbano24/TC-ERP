-- Solo GRANT (ejecutar DESPUÉS de apply_px_incremental_capture.sql si fallaron permisos)
-- NO copiar líneas con "..." — ejecutar este archivo completo tal cual.

GRANT EXECUTE ON FUNCTION public.join_or_start_px_reception_tx(text, text, text, integer, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acquire_box_lock_tx(uuid, uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_box_lock_tx(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_px_box_quantity_tx(uuid, integer, text, integer, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_px_box_tx(uuid, integer, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_log_activity(uuid, uuid, text, text, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_is_serial_blocked_in_inventory(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.px_next_guide_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_px_box_tx(uuid, integer, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_px_reception_tx(uuid, integer, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_px_box_tx(uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
