import {
  buildEquipmentSerialSlots,
  looksLikeMac,
  type SerialPickRow,
} from '@/lib/sap/equipmentSerialSlots';
import {
  entrySourceLabel,
  resolveEntrySource,
} from '@/modules/workshop/shared/entrySource';
import {
  enrichWorkshopTaskDisplayLabels,
  type WorkshopTaskLabelSources,
} from '@/modules/workshop/shared/workshopTaskLabels';

export type WorkshopScrapExportRow = {
  id: string;
  os: string;
  serial_principal: string;
  sn: string;
  mac: string;
  ean: string;
  lote: string;
  tecnologia: string;
  marca: string;
  modelo: string;
  estado: string;
  detalle_diagnostico: string;
  razon_scrap: string;
  fecha: string;
  hora: string;
  fecha_scrap: string;
  hora_scrap: string;
  responsable_scrap: string;
  origen: string;
  guia: string;
  agencia: string;
};

function formatDateParts(iso: string | null | undefined): { fecha: string; hora: string } {
  if (!iso) return { fecha: '—', hora: '—' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: '—', hora: '—' };
  return {
    fecha: d.toLocaleDateString('es-GT', { day: 'numeric', month: 'numeric', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit' }),
  };
}

function serialSlotsForExport(raw: Record<string, unknown>): {
  s1: string;
  s2: string;
  s3: string;
  mac: string;
} {
  const allSns = Array.isArray(raw.all_sns)
    ? (raw.all_sns as string[]).map(String).filter(Boolean)
    : raw.serial_number
      ? [String(raw.serial_number)]
      : [];
  const serviceOrders = raw.service_orders as { main_serial?: string | null } | undefined;
  const pickRows: SerialPickRow[] = allSns.map((sn, i) => ({
    id: String((raw.all_dbIds as string[] | undefined)?.[i] || `${raw.id}-${i}`),
    serial_number: sn,
    material: raw.material as string | null | undefined,
    valuation: raw.valuation as string | null | undefined,
    sap_status: raw.sap_status as string | null | undefined,
    created_at: raw.created_at as string | null | undefined,
    s2: i === 0 ? (raw.s2 as string | null | undefined) : null,
    s3: i === 0 ? (raw.s3 as string | null | undefined) : null,
    s4: i === 0 ? (raw.s4 as string | null | undefined) : null,
  }));

  if (pickRows.length === 0) {
    return { s1: 'S/N', s2: '', s3: '', mac: '' };
  }

  const slots = buildEquipmentSerialSlots(pickRows, serviceOrders?.main_serial);
  const macCandidate = [slots.s2, slots.s3, slots.s4].find((v) => looksLikeMac(v)) || '';
  const snCandidate = [slots.s2, slots.s3, slots.s4].find((v) => v && !looksLikeMac(v)) || slots.s2;

  return {
    s1: slots.s1 || 'S/N',
    s2: snCandidate || '',
    s3: slots.s3 || '',
    mac: macCandidate,
  };
}

function resolveOrigen(raw: Record<string, unknown>): string {
  const reception = Array.isArray(raw.receptions) ? raw.receptions[0] : raw.receptions;
  const resolved = resolveEntrySource({
    entry_source: raw.entry_source as string | null | undefined,
    receptions: reception,
    series_entry_map: raw.series_entry_map as Record<string, string> | undefined,
    guide: (reception as { guide_number?: string } | undefined)?.guide_number,
    serial: Array.isArray(raw.all_sns) ? (raw.all_sns as string[])[0] : raw.serial_number,
  });
  const tipo = entrySourceLabel(resolved) || '—';
  const carrier = (reception as { carrier?: string } | undefined)?.carrier || '';
  return carrier && carrier !== 'Desconocido' ? `${tipo} · ${carrier}` : tipo;
}

/** Una fila Excel por equipo (OS) en cola SCRAPS. */
export function buildWorkshopScrapExportRow(
  raw: Record<string, unknown>,
  labelSources: WorkshopTaskLabelSources,
): WorkshopScrapExportRow {
  const labels = enrichWorkshopTaskDisplayLabels(raw, labelSources);
  const slots = serialSlotsForExport(raw);
  const displayAt = String(raw.stage_entered_at || raw.updated_at || '');
  const { fecha, hora } = formatDateParts(displayAt);
  const scrapAt = String(raw.scrap_marked_at || '');
  const scrapParts = formatDateParts(scrapAt);

  const models = raw.models as
    | { name?: string; technologies?: { name?: string } }
    | undefined;
  const brands = raw.brands as { name?: string } | undefined;
  const serviceOrders = raw.service_orders as
    | { os_label?: string; reception_guides?: { agency?: string } }
    | undefined;
  const reception = Array.isArray(raw.receptions) ? raw.receptions[0] : raw.receptions;
  const receptionGuide = (reception as { reception_guides?: { agency?: string } } | undefined)
    ?.reception_guides;

  return {
    id: String(raw.id || raw.service_order_id || ''),
    os: serviceOrders?.os_label || 'S/OS',
    serial_principal: slots.s1,
    sn: slots.s2,
    mac: slots.mac,
    ean: String(raw.material || '').trim() || '—',
    lote: String(raw.valuation || '').trim() || '—',
    tecnologia: models?.technologies?.name || '—',
    marca: brands?.name || '—',
    modelo: models?.name || '—',
    estado: 'SCRAPS',
    detalle_diagnostico: labels.diagnosticoDetalleLabel,
    razon_scrap: labels.scrapReasonLabel,
    fecha,
    hora,
    fecha_scrap: scrapParts.fecha,
    hora_scrap: scrapParts.hora,
    responsable_scrap: String(raw.scrap_marked_by_name || '').trim() || '—',
    origen: resolveOrigen(raw),
    guia: (reception as { guide_number?: string } | undefined)?.guide_number || '—',
    agencia:
      receptionGuide?.agency ||
      serviceOrders?.reception_guides?.agency ||
      '—',
  };
}

export const WORKSHOP_SCRAP_EXPORT_HEADERS: Array<{
  key: keyof WorkshopScrapExportRow;
  header: string;
}> = [
  { key: 'id', header: 'ID' },
  { key: 'os', header: 'OS' },
  { key: 'serial_principal', header: 'Serial Principal' },
  { key: 'sn', header: 'SN' },
  { key: 'mac', header: 'MAC' },
  { key: 'ean', header: 'EAN' },
  { key: 'lote', header: 'Lote' },
  { key: 'tecnologia', header: 'Tecnología' },
  { key: 'marca', header: 'Marca' },
  { key: 'modelo', header: 'Modelo' },
  { key: 'estado', header: 'Estado' },
  { key: 'detalle_diagnostico', header: 'Detalle Diagnóstico' },
  { key: 'razon_scrap', header: 'Razón Scrap' },
  { key: 'fecha', header: 'Fecha' },
  { key: 'hora', header: 'Hora' },
  { key: 'fecha_scrap', header: 'Fecha Scrap' },
  { key: 'hora_scrap', header: 'Hora Scrap' },
  { key: 'responsable_scrap', header: 'Responsable Scrap' },
  { key: 'origen', header: 'Origen' },
  { key: 'guia', header: 'Guía' },
  { key: 'agencia', header: 'Agencia' },
];
