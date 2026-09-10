/** Pestañas operativas con columnas ampliadas y scroll horizontal superior. */
export const WORKSHOP_QUEUE_EXTENDED_TABLE_TABS = [
  'diagnostico',
  'reparacion',
  'reacondicionado',
  'l3',
  'qc',
] as const;

export type WorkshopQueueExtendedTableTab =
  (typeof WORKSHOP_QUEUE_EXTENDED_TABLE_TABS)[number];

/** Equipos (OS) por página en la cola de Taller. */
export const WORKSHOP_QUEUE_PAGE_SIZE = 25;

export type WorkshopQueueTabId =
  | 'diagnostico'
  | 'reparacion'
  | 'esperando_partes'
  | 'reacondicionado'
  | 'qc'
  | 'l3'
  | 'scraps'
  | 'listo'
  | 'po'
  | 'despacho';

export function workshopQueueUsesTopScroll(tab: string): boolean {
  return tab !== 'po' && tab !== 'despacho';
}

export function workshopQueueShowsDiagnosticColumn(tab: string): boolean {
  return (WORKSHOP_QUEUE_EXTENDED_TABLE_TABS as readonly string[]).includes(tab);
}

/** SCRAPS: notas y checklist del diagnóstico inicial (no solo catálogo). */
export function workshopQueueShowsDiagnosticDetailColumn(tab: string): boolean {
  return tab === 'scraps';
}

export function workshopQueueShowsScrapReasonColumn(tab: string): boolean {
  return tab === 'scraps';
}

export function workshopQueueShowsScrapResponsableColumn(tab: string): boolean {
  return tab === 'scraps';
}

export function workshopQueueShowsQcHistoryColumns(tab: string): boolean {
  return tab === 'qc';
}

/** SCRAPS: tabla densa — oculta columnas poco usadas en cola sin caja. */
export const WORKSHOP_SCRAPS_HIDDEN_FILTER_COLS = ['hist', 'caja', 'ingresos'] as const;

export type WorkshopScrapsHiddenFilterCol =
  (typeof WORKSHOP_SCRAPS_HIDDEN_FILTER_COLS)[number];

export function workshopQueueIsCompactTab(tab: string): boolean {
  return tab === 'scraps';
}

export function workshopQueueTableRowHeight(tab: string): number {
  return workshopQueueIsCompactTab(tab) ? 34 : 36;
}

export function workshopQueueTableMaxBodyHeight(tab: string): number {
  return workshopQueueIsCompactTab(tab) ? 720 : 680;
}

/** Anchos fijos (px) — sin `fr`; prioriza Diagnóstico y Razón SCRAPS legibles. */
export const WORKSHOP_SCRAPS_COLUMN_WIDTHS = {
  select: '28px',
  os: '76px',
  s1: '112px',
  s2: '100px',
  s3: '100px',
  s4: '100px',
  tec: '52px',
  modelo: '136px',
  detalle_diagnostico: '220px',
  razon_scrap: '220px',
  responsable_scrap: '120px',
  fecha: '76px',
  accion: '80px',
} as const;

/** SCRAPS: ancho natural del grid; sin mínimo artificial que infla columnas `fr`. */
export function workshopQueueTableMinWidth(tab: string): number | undefined {
  if (tab === 'po' || tab === 'despacho' || tab === 'scraps') return undefined;
  if (tab === 'qc') return 1680;
  if ((WORKSHOP_QUEUE_EXTENDED_TABLE_TABS as readonly string[]).includes(tab)) return 1480;
  return 1280;
}

export function workshopQueueTableClassName(tab: string): string {
  return workshopQueueIsCompactTab(tab) ? '!w-max shrink-0' : '';
}
