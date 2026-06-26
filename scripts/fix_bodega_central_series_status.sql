-- =============================================================================
-- Backfill: series físicamente en cajas de BODEGA_CENTRAL que quedaron con
-- current_status = 'RECEPCIONADO_BODEGA_GENERAL' (rezagadas) -> 'in_central_warehouse'
--
-- Contexto: el RPC finalize_px_reception_tx (039) ya crea las series como
-- 'in_central_warehouse'. Recepciones antiguas (REC-800002/04/03/01) se finalizaron
-- antes de ese comportamiento y sus cajas se movieron a BODEGA_CENTRAL pero el
-- status de la serie no se actualizó. Esto las alinea con el flujo actual.
--
-- Riesgo SAP: las series afectadas NO tienen sap_transfer_id (0), por lo que este
-- backfill no desincroniza los documentos de traslado SAP.
-- NO se modifica sap_status (validación SAP) ni se mueve ninguna caja.
-- =============================================================================

-- 1) ANTES: conteo de series objetivo
SELECT count(*) AS series_a_corregir
FROM public.series s
JOIN public.boxes b ON b.id = s.current_box_id
WHERE s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  AND b.rack_location = 'BODEGA_CENTRAL';

-- 2) UPDATE acotado
UPDATE public.series s
SET current_status = 'in_central_warehouse',
    updated_at = now()
FROM public.boxes b
WHERE b.id = s.current_box_id
  AND s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  AND b.rack_location = 'BODEGA_CENTRAL';

-- 3) DESPUÉS: verificación por status en cajas BODEGA_CENTRAL
SELECT s.current_status::text AS estado, count(*) AS n
FROM public.series s
JOIN public.boxes b ON b.id = s.current_box_id
WHERE b.rack_location = 'BODEGA_CENTRAL'
GROUP BY 1
ORDER BY n DESC;
