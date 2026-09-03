export type ErpModule = {
  id: number;
  nombre: string;
  descripcion: string;
  ruta: string;
  categoria: 'Logística' | 'Producción' | 'Bodega' | 'Gestión' | 'Sistema';
};

export const erpModules: ErpModule[] = [
  // LOGÍSTICA
  { id: 1, categoria: 'Logística', nombre: "Recepción General", descripcion: "Módulo unificado para CAC y Planta Externa (PX).", ruta: "/recepcion" },
  { id: 4, categoria: 'Logística', nombre: "Devoluciones", descripcion: "Trazabilidad entrada/salida y motivos de retorno.", ruta: "/logistica/devoluciones" },
  
  // PRODUCCIÓN
  { id: 3, categoria: 'Producción', nombre: "Backoffice (Series)", descripcion: "Registro SN, aceptación y generación de OS.", ruta: "/produccion/backoffice" },
  { id: 9, categoria: 'Producción', nombre: "Taller Técnico", descripcion: "Diagnóstico, reparación (L3/L4) y Kitting.", ruta: "/produccion/taller" },
  { id: 15, categoria: 'Producción', nombre: "Control de Calidad", descripcion: "Validación cosmética y Power On/Off.", ruta: "/produccion/qc" },
  { id: 16, categoria: 'Producción', nombre: "Integración SAP", descripcion: "Validación y Centro de Sincronización SAP.", ruta: "/integracion-sap" },

  // BODEGA
  { id: 6, categoria: 'Bodega', nombre: "Gestión de Bodega", descripcion: "Ubicación en rack, cajas homogéneas y movimientos.", ruta: "/bodega/gestion" },
  { id: 7, categoria: 'Bodega', nombre: "Ingreso Inteligente", descripcion: "Autocompletado por serie y cierre de caja.", ruta: "/bodega/ingreso" },
  { id: 8, categoria: 'Bodega', nombre: "Tipos de Salida", descripcion: "Salidas masivas: Producción, Obsoleto, etc.", ruta: "/bodega/salidas" },
  { id: 20, categoria: 'Bodega', nombre: "Bodega de Salida", descripcion: "Cajas OUTBOUND / staging de despacho (LEGACY).", ruta: "/bodega/salida" },
  { id: 21, categoria: 'Bodega', nombre: "Bodega SCRAPS", descripcion: "Cajas SCRAP transferidas o de despacho scrap.", ruta: "/bodega/scraps" },
  { id: 22, categoria: 'Bodega', nombre: "Bodega de Partes", descripcion: "Catálogo, inventario, solicitudes y compras de piezas.", ruta: "/bodega/partes" },

  // DESPACHO
  { id: 10, categoria: 'Bodega', nombre: "Despacho Final", descripcion: "Masivo, individual y Master Box.", ruta: "/despacho" },

  { id: 17, categoria: 'Gestión', nombre: "Portal de Reportes", descripcion: "Catálogo unificado de exportaciones Excel/CSV.", ruta: "/reportes" },
  { id: 18, categoria: 'Gestión', nombre: "Autorizaciones", descripcion: "Bandeja del Gerente General para acciones pre-autorizadas.", ruta: "/autorizaciones" },
  { id: 11, categoria: 'Gestión', nombre: "Dashboard & BI", descripcion: "Productividad, KPIs y proyección de capacidad.", ruta: "/gestion/bi" },
  { id: 12, categoria: 'Gestión', nombre: "Costos & Rentabilidad", descripcion: "Costeo por equipo, técnico y proyecto.", ruta: "/gestion/costos" },
  { id: 13, categoria: 'Gestión', nombre: "Alertas & SLA", descripcion: "Monitoreo de tiempos y alertas preventivas.", ruta: "/gestion/alertas" },

  // SISTEMA
  { id: 14, categoria: 'Sistema', nombre: "Seguridad & Logs", descripcion: "Control de acceso (RBAC) y auditoría Supabase.", ruta: "/sistema/seguridad" },
  { id: 19, categoria: 'Sistema', nombre: "Salud del Sistema", descripcion: "Estado de API, Supabase, colas, crons y consumos estimados.", ruta: "/sistema/salud" },
];

export type NavigationItem = {
  label: string;
  href: string;
  descripcion: string;
  icon?: string;
  /** Clave en erp_role_permissions.module_name (default: label) */
  permissionKey?: string;
};

// Main sidebar groups
export const navigationGroups = [
  {
    title: "General",
    items: [
      { label: "Dashboard", href: "/dashboard", descripcion: "Resumen Operativo", icon: "LayoutDashboard" },
      { label: "Consulta", href: "/consulta", descripcion: "Trazabilidad de Equipos", icon: "Activity" },
    ]
  },
  {
    title: "Logística",
    items: [
      { label: "Recepción General", href: "/recepcion", descripcion: "Control CAC y Planta Externa", icon: "PackageSearch" },
      { label: "Devoluciones", href: "/logistica/devoluciones", descripcion: "Gestión retornos", icon: "Undo2" },
    ]
  },
  {
    title: "Operaciones",
    items: [
      { label: "Backoffice", href: "/produccion/backoffice", descripcion: "Aceptación & SN", icon: "Laptop" },
      { label: "Taller", href: "/produccion/taller", descripcion: "Reparación & QC", icon: "Wrench" },
      { label: "Bodega", href: "/bodega/gestion", descripcion: "Racks & Stock", icon: "Warehouse" },
      { label: "Bodega SCRAPS", href: "/bodega/scraps", descripcion: "Cajas SCRAP", icon: "Trash2", permissionKey: "Bodega" },
      { label: "Accesorios", href: "/bodega/accesorios", descripcion: "Bodega de Accesorios", icon: "Boxes", permissionKey: "Accesorios" },
      { label: "Bodega de Partes", href: "/bodega/partes", descripcion: "Piezas / Solicitudes", icon: "PackageCheck", permissionKey: "Bodega" },
      { label: "Despacho", href: "/despacho", descripcion: "Salida de Equipos", icon: "Truck", permissionKey: "Despacho" },
      { label: "Integración SAP", href: "/integracion-sap", descripcion: "Centro de Validación", icon: "Database", permissionKey: "Integración SAP" },
    ]
  },
  {
    title: "Gestión & BI",
    items: [
      { label: "Autorizaciones", href: "/autorizaciones", descripcion: "Aprobaciones Gerente", icon: "ShieldCheck", permissionKey: "Autorizaciones" },
      { label: "Reportes", href: "/reportes", descripcion: "Exportaciones centralizadas", icon: "FileSpreadsheet", permissionKey: "Reportes" },
      { label: "Recursos Humanos", href: "/rrhh", descripcion: "Asistencia y Planilla", icon: "Users" },
      { label: "Productividad", href: "/gestion/bi", descripcion: "Métricas y KPIs", icon: "TrendingUp" },
      { label: "Costos", href: "/gestion/costos", descripcion: "Análisis financiero", icon: "CircleDollarSign" },
      { label: "Seguridad", href: "/sistema/seguridad", descripcion: "Auditoría & Roles", icon: "ShieldCheck" },
      { label: "Salud", href: "/sistema/salud", descripcion: "Estado del sistema", icon: "HeartPulse", permissionKey: "Salud" },
    ]
  }
];

export type DashboardMetric = {
  label: string;
  valor: string;
  detalle: string;
};

export const starterMetrics: DashboardMetric[] = [
  { label: "Recepciones CAC", valor: "46", detalle: "Guías ingresadas hoy" },
  { label: "WIP Taller", valor: "342", detalle: "Equipos en proceso" },
  { label: "Stock Bodega", valor: "402K", detalle: "Total unidades en rack" },
  { label: "Eficiencia", valor: "94%", detalle: "Cumplimiento de metas" },
];
