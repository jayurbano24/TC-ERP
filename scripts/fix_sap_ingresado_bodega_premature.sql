-- Revierte INGRESADO_BODEGA si alguna serie del doc SAP aún no está encajonada.
-- Ejecutar si un backfill previo marcó documentos antes de encajonar.

UPDATE public.sap_transfer_documents std
SET status = 'PENDIENTE_INGRESO_BODEGA',
    updated_at = now()
WHERE std.status = 'INGRESADO_BODEGA'
  AND EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.sap_transfer_id = std.id
      AND (
        s.current_status::text <> 'in_central_warehouse'
        OR s.current_box_id IS NULL
      )
  );

SELECT status, count(*) AS n
FROM public.sap_transfer_documents
GROUP BY status
ORDER BY n DESC;
