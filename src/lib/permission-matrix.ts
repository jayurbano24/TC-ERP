import { WORKSHOP_PERMISSION_MODULES } from '@/shared/authz/workshopTabPermissions';

/** Módulos administrables desde Seguridad → Roles y permisos. */
export const PERMISSION_MATRIX_MODULES = [
  'Dashboard',
  'Consulta',
  'Recepción General',
  'Devoluciones',
  'Backoffice',
  'Taller',
  ...WORKSHOP_PERMISSION_MODULES,
  'Bodega',
  'Bodega SCRAPS',
  'Accesorios',
  'Bodega de Partes',
  'Despacho',
  'Integración SAP',
  'Autorizaciones',
  'Reportes',
  'TEC-LAB DUT',
  'Recursos Humanos',
  'Productividad',
  'Costos',
  'Seguridad',
  'Salud',
  'Configuración del Sistema',
] as const;
