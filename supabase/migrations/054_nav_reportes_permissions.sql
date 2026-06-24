-- Permisos de menú: Reportes + módulos operativos (RBAC vía hr_positions)
-- role_id en erp_role_permissions referencia hr_positions.id (no erp_roles).

-- A) Por nombre de puesto en RRHH (si coincide)
INSERT INTO public.erp_role_permissions (role_id, module_name, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT hp.id, m.module_name, true, false, false, false, false, true
FROM public.hr_positions hp
CROSS JOIN (
  VALUES
    ('Reportes'),
    ('Accesorios'),
    ('Integración SAP')
) AS m(module_name)
WHERE hp.name IN (
  'Administrador',
  'Supervisor',
  'GERENTE GENERAL',
  'GERENTE',
  'SUPER ADMIN'
)
   OR hp.name ILIKE '%administrador%'
   OR hp.name ILIKE '%supervisor%'
   OR hp.name ILIKE '%gerente%'
ON CONFLICT (role_id, module_name) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_export = EXCLUDED.can_export;

-- B) Admin ERP: puestos que ya tienen Seguridad o Configuración
INSERT INTO public.erp_role_permissions (role_id, module_name, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT DISTINCT p.role_id, m.module_name, true, false, false, false, false, true
FROM public.erp_role_permissions p
CROSS JOIN (
  VALUES
    ('Reportes'),
    ('Accesorios'),
    ('Integración SAP')
) AS m(module_name)
WHERE p.can_view = true
  AND p.module_name IN ('Seguridad', 'Configuración del Sistema', 'Configuración')
ON CONFLICT (role_id, module_name) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_export = EXCLUDED.can_export;

-- C) Supervisión: puestos con Productividad / Dashboard
INSERT INTO public.erp_role_permissions (role_id, module_name, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT DISTINCT p.role_id, 'Reportes', true, false, false, false, false, true
FROM public.erp_role_permissions p
WHERE p.can_view = true
  AND p.module_name IN ('Productividad', 'Dashboard', 'Dashboard & BI', 'Costos')
ON CONFLICT (role_id, module_name) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_export = EXCLUDED.can_export;

-- D) Roles con Productividad también pueden ver Reportes (herencia)
INSERT INTO public.erp_role_permissions (role_id, module_name, can_view, can_export)
SELECT DISTINCT p.role_id, 'Reportes', true, true
FROM public.erp_role_permissions p
WHERE p.module_name = 'Productividad' AND p.can_view = true
ON CONFLICT (role_id, module_name) DO UPDATE SET
  can_view = true,
  can_export = COALESCE(public.erp_role_permissions.can_export, true);

-- E) Operativos bodega: quien tiene Bodega recibe Accesorios + Reportes (lectura)
INSERT INTO public.erp_role_permissions (role_id, module_name, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT DISTINCT p.role_id, m.module_name, true, false, false, false, false, true
FROM public.erp_role_permissions p
CROSS JOIN (
  VALUES ('Accesorios'), ('Reportes')
) AS m(module_name)
WHERE p.can_view = true
  AND p.module_name IN ('Bodega', 'Gestión de Bodega', 'Accesorios', 'Bodega Accesorios')
ON CONFLICT (role_id, module_name) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_export = EXCLUDED.can_export;
