-- Repoblar cac_tray_units para equipos ya clasificados que no aparecen en Historial CAC.
-- Ejecutar en Supabase SQL Editor si clasificó antes del fix del adaptador legacy.

SELECT public.backfill_cac_tray_units(10000, 0);

-- Verificar filas activas de hoy (ajuste la fecha):
SELECT os_label, guide_number, classified_at, is_active, excluded_reason
FROM public.cac_tray_units
WHERE classified_at >= (CURRENT_DATE AT TIME ZONE 'America/Guatemala')
ORDER BY classified_at DESC
LIMIT 50;
