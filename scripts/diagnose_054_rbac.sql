-- Diagnóstico 054 — permisos Reportes / Accesorios (ejecutar en Supabase)
-- Ayuda a ver por qué el checklist marca 054 como MISSING.

-- 1) Puestos RRHH
SELECT 'hr_positions' AS origen, id, name
FROM public.hr_positions
ORDER BY name;

-- 2) Permisos Reportes / Accesorios actuales
SELECT
  hp.name AS puesto,
  p.module_name,
  p.can_view,
  p.can_export
FROM public.erp_role_permissions p
LEFT JOIN public.hr_positions hp ON hp.id = p.role_id
WHERE p.module_name IN ('Reportes', 'Accesorios', 'Integración SAP', 'Seguridad', 'Productividad', 'Dashboard')
ORDER BY hp.name, p.module_name;

-- 3) Conteo rápido (debe ser > 0 tras 054)
SELECT
  count(*) FILTER (WHERE module_name = 'Reportes' AND can_view) AS reportes_view,
  count(*) FILTER (WHERE module_name = 'Accesorios' AND can_view) AS accesorios_view,
  count(*) FILTER (WHERE module_name = 'Integración SAP' AND can_view) AS sap_view
FROM public.erp_role_permissions;
