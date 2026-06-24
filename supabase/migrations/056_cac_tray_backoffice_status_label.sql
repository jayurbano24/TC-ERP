-- Etiqueta bandeja CAC: clasificado en backoffice, pendiente encajonar en bodega.

CREATE OR REPLACE FUNCTION public.cac_tray_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_status, '')))
    WHEN 'recepcionado_bodega_general' THEN 'Ingresado a Backoffice'
    WHEN 'pendiente_ingreso_bodega' THEN 'Ingresado a Backoffice'
    WHEN 'in_central_warehouse' THEN 'Ingresado a Bodega General'
    WHEN 'ingresado_bodega' THEN 'Ingresado a Bodega General'
    WHEN 'returned' THEN 'Devuelto'
    WHEN 'devuelto_bloque' THEN 'Devuelto'
    WHEN 'dispatched' THEN 'Despachado'
    WHEN 'despachado' THEN 'Despachado'
    ELSE COALESCE(NULLIF(trim(p_status), ''), '---')
  END;
$$;

UPDATE public.cac_tray_units
SET unit_status_label = public.cac_tray_status_label(unit_status),
    updated_at = now()
WHERE unit_status = 'RECEPCIONADO_BODEGA_GENERAL'
   OR unit_status_label IN (
     'Pendiente de Ingreso a Bodega General',
     'Ingresado a Backoffice, PENDIENTE_INGRESO_BODEGA'
   );
