/** Fallback si migración 053 aún no está aplicada. */
export const STATIC_REPORT_CATALOG = [
  {
    code: 'CAC_CLASIFICACION_HISTORICO',
    name: 'Histórico clasificación CAC',
    category: 'CAC / Recepción',
    description: 'Equipos clasificados en backoffice con OS TC-XXX',
    columns: [
      'Fecha / Hora', 'No. Guía', 'Piloto', 'Courier', 'Recibió', 'Estatus',
      'Orden de Servicio', 'Ingreso', 'Agencia CAC', 'Tecnología', 'Marca', 'Modelo',
      'Documento SAP', 'Validación SAP', 'S-1', 'S-2', 'S-3', 'S-4',
    ],
    requiresDateRange: true,
  },
  {
    code: 'RECEPCION_HISTORICO_CAC',
    name: 'Histórico recepciones CAC',
    category: 'CAC / Recepción',
    description: 'Guías recepcionadas en CAC',
    columns: ['Fecha', 'No. Guía', 'Piloto', 'Courier', 'Recibió', 'Estatus', 'Unidades'],
    requiresDateRange: true,
  },
  {
    code: 'INVENTARIO_ACCESORIOS',
    name: 'Stock accesorios',
    category: 'Bodega',
    description: 'Stock nuevo y recuperado por accesorio',
    columns: ['Código', 'Nombre', 'Qty Nuevo', 'Qty Recuperado', 'Último movimiento'],
    requiresDateRange: false,
  },
  {
    code: 'DESPACHO_POR_LOTE_SALIDA',
    name: 'Contenido lote de salida',
    category: 'Despacho',
    description: 'Equipos y accesorios agrupados por lote LS-YYYY-NNNNN',
    columns: ['Lote', 'Estado Lote', 'Tipo', 'Referencia', 'Detalle', 'Cantidad', 'Destino', 'Fecha'],
    requiresDateRange: true,
  },
  {
    code: 'DESPACHO_ACCESORIOS_SIN_LOTE',
    name: 'Salidas accesorios directas',
    category: 'Despacho',
    description: 'Movimientos OUT sin lote de salida',
    columns: ['Fecha', 'Accesorio', 'Condición', 'Cantidad', 'Destino', 'Usuario'],
    requiresDateRange: true,
  },
];
