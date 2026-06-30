/**
 * Taxonomía de módulos de autorización.
 *
 * Fuente autoritativa: `erp_role_permissions.module_name` (verificado EN VIVO).
 * Estos nombres deben coincidir EXACTAMENTE con los de la tabla; cualquier
 * desalineación se detecta en modo LOG-ONLY antes de pasar a ENFORCE.
 */
export const AUTHZ_MODULE = {
  BODEGA: 'Bodega',
  TALLER: 'Taller',
  DASHBOARD: 'Dashboard',
  CONSULTA: 'Consulta',
  DEVOLUCIONES: 'Devoluciones',
  BACKOFFICE: 'Backoffice',
  ACCESORIOS: 'Accesorios',
  INTEGRACION_SAP: 'Integración SAP',
  DESPACHO: 'Despacho',
  REPORTES: 'Reportes',
  RECEPCION_GENERAL: 'Recepción General',
  CONFIGURACION_SISTEMA: 'Configuración del Sistema',
  SEGURIDAD: 'Seguridad',
} as const;

export type AuthzModule = (typeof AUTHZ_MODULE)[keyof typeof AUTHZ_MODULE];

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';
