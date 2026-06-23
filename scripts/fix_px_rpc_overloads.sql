-- Fix ERROR 42725: function name is not unique (PX RPC overloads)
-- Ejecutar en Supabase SQL Editor si 039 falló en GRANT.
-- Luego re-ejecutar solo desde "-- RPC: única entrada recepción" en apply_px_incremental_capture.sql
-- O ejecutar apply_px_incremental_capture.sql completo de nuevo.

DROP FUNCTION IF EXISTS public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.capture_px_equipment_tx(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, text);

DROP FUNCTION IF EXISTS public.join_or_start_px_reception_tx(text, text, text, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.join_or_start_px_reception_tx(text, text, text, integer, text, uuid, text, text);

DROP FUNCTION IF EXISTS public.acquire_box_lock_tx(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.release_box_lock_tx(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_px_box_quantity_tx(uuid, integer, text, integer, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_px_box_quantity_tx(uuid, integer, text, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.close_px_box_tx(uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.close_px_box_tx(uuid, integer, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.reopen_px_box_tx(uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.finalize_px_reception_tx(uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.promote_px_box_tx(uuid, uuid, text);

-- Verificar que no queden duplicados:
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'join_or_start_px_reception_tx',
    'capture_px_equipment_tx',
    'close_px_box_tx',
    'finalize_px_reception_tx'
  )
ORDER BY 1, 2;
