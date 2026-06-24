-- CHG-002 backfill: documentos SAP con todas las series ya en bodega central
-- Ejecutar en Supabase SQL Editor (requiere warehouse_sync_* de 047 o 055).

DO $$
DECLARE
  v_sap_id uuid;
  v_n integer := 0;
BEGIN
  FOR v_sap_id IN
    SELECT std.id
    FROM public.sap_transfer_documents std
    WHERE coalesce(std.status, '') IN ('PENDIENTE_INGRESO_BODEGA', '')
      AND EXISTS (SELECT 1 FROM public.series s WHERE s.sap_transfer_id = std.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.series s
        WHERE s.sap_transfer_id = std.id
          AND (
            s.current_status::text <> 'in_central_warehouse'
            OR s.current_box_id IS NULL
          )
      )
  LOOP
    IF public.warehouse_sync_sap_transfer_ingresado(v_sap_id) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'SAP docs actualizados a INGRESADO_BODEGA: %', v_n;
END;
$$;

SELECT status, count(*) AS n
FROM public.sap_transfer_documents
GROUP BY status
ORDER BY n DESC;
