import type { WorkshopTabId } from '@/lib/database/workshop';
import { fetchWorkshopTasksPageViaApi } from '@/lib/api/workshopTasks';

const TAB_LABELS: Record<string, string> = {
  diagnostico: 'Diagnostico',
  reparacion: 'Reparacion',
  reacondicionado: 'Reacondicionado',
  qc: 'Control_Calidad',
  l3: 'L3',
  scraps: 'Scraps',
};

/** Carga todas las páginas de una pestaña Taller (para export). */
export async function fetchAllWorkshopTasksForTab(tab: WorkshopTabId): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 200; page++) {
    const res = await fetchWorkshopTasksPageViaApi(tab, cursor);
    if (res.items?.length) all.push(...res.items);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }

  return all;
}

export type WorkshopExportRow = {
  os: string;
  serie_principal: string;
  series: string;
  cantidad_series: number;
  tecnologia: string;
  marca: string;
  modelo: string;
  ingreso: string;
  etapa: string;
  responsable: string;
  guia: string;
  agencia: string;
  courier: string;
};

export function adaptWorkshopItemForExport(item: {
  service_orders?: { os_label?: string };
  all_sns?: string[];
  serial_number?: string;
  models?: { name?: string; technologies?: { name?: string } };
  brands?: { name?: string };
  updated_at?: string;
  current_status?: string;
  receptions?: { guide_number?: string; carrier?: string; source?: string; notes?: string };
  ingress_count?: number;
}): WorkshopExportRow {
  const notes = (item.receptions?.notes || '').replace(/\\n/g, '\n');
  let responsable = '—';
  const respMatch = notes.match(/Por:\s*([^\n]+)/i);
  if (respMatch) responsable = respMatch[1].trim();

  const stageRaw =
    item.current_status === 'in_workshop'
      ? 'DIAGNOSTICO'
      : item.current_status === 'in_qc'
        ? 'REPARACION'
        : item.current_status === 'in_validation'
          ? 'CONTROL DE CALIDAD'
          : item.current_status === 'in_control_warehouse'
            ? 'L3'
            : item.current_status === 'ready_to_dispatch'
              ? 'REACONDICIONADO'
              : item.current_status === 'irreparable' || item.current_status === 'scrapped'
                ? 'SCRAPS'
                : String(item.current_status || '').toUpperCase();

  const allSns = item.all_sns?.length
    ? item.all_sns
    : item.serial_number
      ? [item.serial_number]
      : [];

  return {
    os: item.service_orders?.os_label || 'S/OS',
    serie_principal: allSns[0] || 'S/N',
    series: allSns.join(', '),
    cantidad_series: allSns.length || 1,
    tecnologia: item.models?.technologies?.name || '—',
    marca: item.brands?.name || '—',
    modelo: item.models?.name || '—',
    ingreso: item.updated_at ? new Date(item.updated_at).toLocaleString() : '—',
    etapa: stageRaw,
    responsable,
    guia: item.receptions?.guide_number || '—',
    agencia: '—',
    courier: item.receptions?.source
      ? `${item.receptions.source} - ${item.receptions.carrier || ''}`
      : '—',
  };
}

export async function exportWorkshopRowsToExcel(tab: string, rows: WorkshopExportRow[]): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Taller');
  const label = TAB_LABELS[tab] || tab;
  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Reporte_Taller_${label}_${today}.xlsx`);
}

export async function exportWorkshopTabToExcel(
  tab: WorkshopTabId,
  adaptRow?: (raw: any) => WorkshopExportRow
): Promise<void> {
  const rawItems = await fetchAllWorkshopTasksForTab(tab);
  const mapper = adaptRow ?? adaptWorkshopItemForExport;
  await exportWorkshopRowsToExcel(tab, rawItems.map(mapper));
}
