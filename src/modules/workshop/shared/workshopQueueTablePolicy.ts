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

export function workshopQueueShowsQcHistoryColumns(tab: string): boolean {
  return tab === 'qc';
}

export function workshopQueueTableMinWidth(tab: string): number | undefined {
  if (tab === 'po' || tab === 'despacho') return undefined;
  if (tab === 'qc') return 1680;
  if ((WORKSHOP_QUEUE_EXTENDED_TABLE_TABS as readonly string[]).includes(tab)) return 1480;
  return 1280;
}
