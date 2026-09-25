-- Diagnóstico: ¿por qué una OS/serie NO aparece en Equipo Listo?
-- Reemplace :serial con SN, S2, S3 o S4 (o use os_label en el segundo bloque).

-- 1) Estado actual de la serie
SELECT
  s.id AS series_id,
  s.serial_number,
  s.s2,
  s.s3,
  s.s4,
  s.current_status::text AS status,
  so.os_label,
  b.box_code,
  b.rack_location
FROM public.series s
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
LEFT JOIN public.boxes b ON b.id = s.current_box_id
WHERE upper(trim(s.serial_number)) = upper(trim(:'serial'))
   OR upper(trim(coalesce(s.s2, ''))) = upper(trim(:'serial'))
   OR upper(trim(coalesce(s.s3, ''))) = upper(trim(:'serial'))
   OR upper(trim(coalesce(s.s4, ''))) = upper(trim(:'serial'))
LIMIT 5;

-- 2) Auditoría taller (debe existir al menos una acción válida + QC listo)
SELECT al.created_at, al.action, al.module, al.record_id
FROM public.erp_audit_logs al
WHERE al.record_id IN (
  SELECT s.id::text
  FROM public.series s
  WHERE upper(trim(s.serial_number)) = upper(trim(:'serial'))
     OR upper(trim(coalesce(s.s2, ''))) = upper(trim(:'serial'))
     OR upper(trim(coalesce(s.s3, ''))) = upper(trim(:'serial'))
     OR upper(trim(coalesce(s.s4, ''))) = upper(trim(:'serial'))
)
ORDER BY al.created_at DESC
LIMIT 30;

-- 3) ¿Entraría al RPC Equipo Listo?
SELECT EXISTS (
  SELECT 1
  FROM public.series s
  WHERE (
      upper(trim(s.serial_number)) = upper(trim(:'serial'))
      OR upper(trim(coalesce(s.s2, ''))) = upper(trim(:'serial'))
      OR upper(trim(coalesce(s.s3, ''))) = upper(trim(:'serial'))
      OR upper(trim(coalesce(s.s4, ''))) = upper(trim(:'serial'))
    )
    AND s.current_status::text = 'in_central_warehouse'
    AND EXISTS (
      SELECT 1
      FROM public.erp_audit_logs al
      WHERE al.record_id = s.id::text
        AND al.action IN (
          'INGRESO A TALLER',
          'DIAGNÓSTICO INICIAL COMPLETADO',
          'REPARACIÓN COMPLETADA',
          'REPARACIÓN L3 COMPLETADA',
          'CONTROL DE CALIDAD COMPLETADO',
          'REACONDICIONADO COMPLETADO',
          'TRASLADO MASIVO A TALLER'
        )
    )
) AS en_cola_equipo_listo;
