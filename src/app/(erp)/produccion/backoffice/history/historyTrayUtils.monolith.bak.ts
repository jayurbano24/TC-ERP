/** Bandeja Historial Global — solo ingresos CAC con OS TC-XXX */

export const HISTORY_TRAY_PAGE_SIZE = 25;

export const TC_OS_LABEL_REGEX = /^TC-\d+/i;

export function isTcServiceOrderLabel(label?: string | null): boolean {
  if (!label || label === '---') return false;
  return TC_OS_LABEL_REGEX.test(label.trim());
}

export function orderUnitSeries(unitSeries: any[]): any[] {
  if (!unitSeries.length) return [];
  const os = unitSeries.find((s) => s?.service_orders)?.service_orders;
  const mainSerial = String(os?.main_serial || '').trim().toUpperCase();

  return [...unitSeries].sort((a, b) => {
    const aSn = String(a.serial_number || '').toUpperCase();
    const bSn = String(b.serial_number || '').toUpperCase();
    if (mainSerial) {
      if (aSn === mainSerial && bSn !== mainSerial) return -1;
      if (bSn === mainSerial && aSn !== mainSerial) return 1;
    }
    const ta = new Date(a.created_at || a.updated_at || 0).getTime();
    const tb = new Date(b.created_at || b.updated_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return aSn.localeCompare(bSn);
  });
}

/** Agrupa series por OS (service_order_id) — una fila = un equipo real */
export function groupSeriesIntoEquipmentUnits(
  series: any[],
  resolveSeriesPerUnit: (modelId: string) => number = () => 1
): { modelId: string; brandId: string; unit: any[] }[] {
  const byOs = new Map<string, any[]>();
  const withoutOs: any[] = [];

  for (const s of series) {
    if (!s.brand_id) continue;
    const osId = s.service_order_id;
    if (osId) {
      if (!byOs.has(osId)) byOs.set(osId, []);
      byOs.get(osId)!.push(s);
    } else {
      withoutOs.push(s);
    }
  }

  const units: { modelId: string; brandId: string; unit: any[] }[] = [];

  for (const raw of byOs.values()) {
    const unit = orderUnitSeries(raw);
    units.push({
      modelId: unit[0]?.model_id || '',
      brandId: unit[0]?.brand_id || '',
      unit,
    });
  }

  // Legacy: series sin OS — fallback por modelo (datos antiguos)
  if (withoutOs.length > 0) {
    for (const legacyGroup of groupSeriesByModelBrand(withoutOs)) {
      const seriesPerUnit = Math.max(1, resolveSeriesPerUnit(legacyGroup.modelId) || 1);
      for (let i = 0; i < legacyGroup.fullSeries.length; i += seriesPerUnit) {
        units.push({
          modelId: legacyGroup.modelId,
          brandId: legacyGroup.brandId,
          unit: legacyGroup.fullSeries.slice(i, i + seriesPerUnit),
        });
      }
    }
  }

  return units;
}

/** Solo para datos legacy sin service_order_id */
function groupSeriesByModelBrand(series: any[]) {
  const groups = new Map<string, { modelId: string; brandId: string; fullSeries: any[] }>();
  for (const s of series) {
    if (!s.brand_id) continue;
    const key = (s.model_id || '') + '|' + (s.brand_id || '');
    if (!groups.has(key)) groups.set(key, { modelId: s.model_id, brandId: s.brand_id, fullSeries: [] });
    groups.get(key)!.fullSeries.push(s);
  }
  return Array.from(groups.values());
}

/** @deprecated Usar groupSeriesIntoEquipmentUnits */
export function groupSeriesByEquipment(series: any[]) {
  return groupSeriesByModelBrand(series);
}

export type HistoryUnitEntry = {
  rec: any;
  grp: { modelId: string; brandId: string; fullSeries: any[] };
  unit: any[];
  unitIndex: number;
  groupIndex: number;
  osLabel: string;
  unitGuide: string;
  unitAgencyRaw: string;
  unitSap: string;
  unitStatus: string;
  unitStatusLabel: string;
  sapTransferId: string | null;
  sortAt: number;
  /** Fecha/hora real de clasificación en Backoffice (OS o serie) */
  classifiedAtIso: string;
};

export function filterHistoryRecordsByDate(
  records: any[],
  dateFilterFrom: string,
  dateFilterTo: string
) {
  return records.filter((r) => {
    if (!dateFilterFrom && !dateFilterTo) return true;
    const d = new Date(r.created_at);
    if (dateFilterFrom && d < new Date(dateFilterFrom + 'T00:00:00')) return false;
    if (dateFilterTo) {
      const to = new Date(dateFilterTo + 'T23:59:59');
      if (d > to) return false;
    }
    return true;
  });
}

/** Fecha de clasificación por unidad — prioriza creación de OS, no recepción CAC */
export function resolveUnitClassifiedAt(rec: any, unit: any[], unitGuide?: string): number {
  const times: number[] = [];

  for (const s of unit) {
    const osCreated = s?.service_orders?.created_at;
    if (osCreated) times.push(new Date(osCreated).getTime());
    if (s?.updated_at) times.push(new Date(s.updated_at).getTime());
  }

  const guide = unitGuide || resolveUnitGuide(rec, unit);
  const rg = findReceptionGuide(rec, guide);
  if (rg?.classified_at) times.push(new Date(rg.classified_at).getTime());

  if (times.length > 0) return Math.max(...times);
  return new Date(rec.created_at).getTime();
}

export function filterUnitEntriesByDate(
  entries: HistoryUnitEntry[],
  dateFilterFrom: string,
  dateFilterTo: string
): HistoryUnitEntry[] {
  if (!dateFilterFrom && !dateFilterTo) return entries;
  return entries.filter((e) => {
    const d = new Date(e.classifiedAtIso);
    if (dateFilterFrom && d < new Date(dateFilterFrom + 'T00:00:00')) return false;
    if (dateFilterTo) {
      const to = new Date(dateFilterTo + 'T23:59:59');
      if (d > to) return false;
    }
    return true;
  });
}

export function normalizeGuideKey(guide: string): string {
  return guide
    .trim()
    .replace(/[''`´]/g, "'")
    .toLowerCase();
}

export function findReceptionGuide(rec: any, unitGuide: string) {
  if (!unitGuide || unitGuide === '---') return null;
  const key = normalizeGuideKey(unitGuide);
  return (rec.reception_guides || []).find(
    (rg: any) => normalizeGuideKey(rg.guide_number || '') === key
  );
}

function getBackofficeDetailsSection(notes: string): string {
  if (!notes) return '';
  return notes.includes('--- DETALLES BACKOFFICE ---')
    ? notes.split('--- DETALLES BACKOFFICE ---')[1]?.split('--- LÍNEA DE TIEMPO')[0] || ''
    : notes;
}

function formatGuideDetailsBlock(header: string, body: string): string {
  const sapInHeader = header.match(/\|\s*SAP\s*(.+)$/i)?.[1]?.trim();
  return sapInHeader ? `Backoffice_SAP: ${sapInHeader}\n${body}` : body;
}

/** Bloque de detalles backoffice para una guía concreta (notas) */
export function extractGuideDetailsBlock(notes: string, unitGuide: string): string | null {
  if (!notes || !unitGuide || unitGuide === '---') return null;

  const normTarget = normalizeGuideKey(unitGuide);
  const detailsSection = getBackofficeDetailsSection(notes);

  const regex = /\[Guía ([^\]]+)\]([\s\S]*?)(?=\[Guía|---|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(detailsSection)) !== null) {
    const header = match[1];
    const guidePart = header.split('|')[0];
    const guideList = guidePart.split(',').map((g) => normalizeGuideKey(g.trim()));
    if (guideList.some((g) => g === normTarget)) {
      return formatGuideDetailsBlock(header, match[2]);
    }
  }
  return null;
}

/** Bloque por guía o, si falla, por coincidencia de series en el cuerpo */
export function extractGuideDetailsBlockForUnit(
  notes: string,
  unitGuide: string,
  unit: any[] = []
): string | null {
  if (!notes) return null;

  if (unitGuide && unitGuide !== '---') {
    const byGuide = extractGuideDetailsBlock(notes, unitGuide);
    if (byGuide) return byGuide;
  }

  const serials = unit
    .map((u) => u?.serial_number)
    .filter(Boolean)
    .map((s) => String(s).trim());
  if (!serials.length) return null;

  const detailsSection = getBackofficeDetailsSection(notes);
  const regex = /\[Guía ([^\]]+)\]([\s\S]*?)(?=\[Guía|---|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(detailsSection)) !== null) {
    if (serials.some((sn) => match![2].includes(sn))) {
      return formatGuideDetailsBlock(match[1], match[2]);
    }
  }
  return null;
}

function findReceptionGuideById(rec: any, receptionGuideId?: string | null) {
  if (!receptionGuideId || !rec?.reception_guides?.length) return null;
  return rec.reception_guides.find((rg: any) => rg.id === receptionGuideId) || null;
}

function sapDocsForReceptionGuide(rec: any, receptionGuideId?: string | null) {
  if (!receptionGuideId) return [];
  return (rec.sap_transfer_documents || []).filter(
    (d: any) => d.reception_guide_id === receptionGuideId
  );
}

import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';

export function formatAgencyLabel(
  agencyRaw: string,
  agencies: { id: string; name: string }[] = [],
  receptionCarrier?: string | null
): string {
  const clean = sanitizeCacAgencyRaw(agencyRaw, receptionCarrier, agencies);
  if (!clean) return '---';
  const matched = agencies.find(
    (a) =>
      a.name.toUpperCase() === clean.toUpperCase() ||
      a.id.toUpperCase() === clean.toUpperCase()
  );
  return matched ? `${matched.id} — ${matched.name}` : clean;
}

/** Agencia CAC de ingreso para esta unidad/guía (nunca courier) */
export function resolveUnitAgencyRaw(rec: any, unitGuide: string, unit: any[] = []): string {
  const carrier = rec?.carrier || null;

  const sapTransferId = resolveUnitSapTransferId(rec, unit);
  if (sapTransferId) {
    const doc = (rec.sap_transfer_documents || []).find((d: any) => d.id === sapTransferId);
    const fromDoc = sanitizeCacAgencyRaw(doc?.agency, carrier);
    if (fromDoc) return fromDoc;
  }

  const rg = findReceptionGuide(rec, unitGuide);
  const fromRg = sanitizeCacAgencyRaw(rg?.agency, carrier);
  if (fromRg) return fromRg;

  const os = unit.find((u) => u?.service_orders);
  const nestedRg = os?.service_orders?.reception_guides;
  const agencyFromOs = Array.isArray(nestedRg) ? nestedRg[0]?.agency : nestedRg?.agency;
  const fromOs = sanitizeCacAgencyRaw(agencyFromOs, carrier);
  if (fromOs) return fromOs;

  const rgByOsId = findReceptionGuideById(rec, os?.service_orders?.reception_guide_id);
  const fromRgById = sanitizeCacAgencyRaw(rgByOsId?.agency, carrier);
  if (fromRgById) return fromRgById;

  const block = extractGuideDetailsBlockForUnit(rec.notes || '', unitGuide, unit);
  const fromNotes = block?.match(/Backoffice_Agency:\s*(.+)/i)?.[1]?.trim();
  const fromBlock = sanitizeCacAgencyRaw(fromNotes, carrier);
  if (fromBlock) return fromBlock;

  const globalAgency = rec.notes?.match(/Backoffice_Agency:\s*(.+)/i)?.[1]?.trim();
  return sanitizeCacAgencyRaw(globalAgency, carrier);
}

export function resolveUnitAgencyLabel(
  rec: any,
  unitGuide: string,
  agencies: { id: string; name: string }[] = [],
  unit: any[] = []
): string {
  const raw = resolveUnitAgencyRaw(rec, unitGuide, unit);
  return raw ? formatAgencyLabel(raw, agencies, rec?.carrier) : '---';
}

/** Traslado SAP — prioridad: tabla sap_transfer_documents, luego notas */
export function resolveUnitSap(rec: any, unitGuide: string, unit: any[] = []): string {
  const sapTransferId = resolveUnitSapTransferId(rec, unit);
  if (sapTransferId) {
    const doc = (rec.sap_transfer_documents || []).find((d: any) => d.id === sapTransferId);
    if (doc?.sap_document_number) return doc.sap_document_number;
  }

  const os = unit.find((u) => u?.service_orders);
  const sapFromOs = os?.service_orders?.sap_transfer_documents;
  const sapDoc = Array.isArray(sapFromOs)
    ? sapFromOs[0]?.sap_document_number
    : sapFromOs?.sap_document_number;
  if (sapDoc) return sapDoc;

  const rgId = os?.service_orders?.reception_guide_id;
  const docsForGuide = sapDocsForReceptionGuide(rec, rgId);
  if (docsForGuide.length === 1 && docsForGuide[0]?.sap_document_number) {
    return docsForGuide[0].sap_document_number;
  }

  const block = extractGuideDetailsBlockForUnit(rec.notes || '', unitGuide, unit);
  const fromNotes = block?.match(/Backoffice_SAP:\s*(.+)/i)?.[1]?.trim();
  if (fromNotes) return fromNotes;

  const globalSap = rec.notes?.match(/Backoffice_SAP:\s*(.+)/i)?.[1]?.trim();
  if (globalSap) return globalSap;

  return '---';
}

export function resolveUnitSapTransferId(rec: any, unit: any[]): string | null {
  const fromSeries = unit.find((u) => u?.sap_transfer_id)?.sap_transfer_id;
  if (fromSeries) return fromSeries;

  const os = unit.find((u) => u?.service_orders);
  if (os?.service_orders?.sap_transfer_id) return os.service_orders.sap_transfer_id;

  const rgId = os?.service_orders?.reception_guide_id;
  const docsForGuide = sapDocsForReceptionGuide(rec, rgId);
  if (docsForGuide.length === 1) return docsForGuide[0].id;

  if (docsForGuide.length > 1) {
    const unitGuide = resolveUnitGuide(rec, unit);
    const block = extractGuideDetailsBlockForUnit(rec.notes || '', unitGuide, unit);
    const sapFromNotes = block?.match(/Backoffice_SAP:\s*(.+)/i)?.[1]?.trim();
    if (sapFromNotes) {
      const matched = docsForGuide.find(
        (d: any) => (d.sap_document_number || '').trim() === sapFromNotes
      );
      if (matched) return matched.id;
    }
  }

  return null;
}

export function formatUnitStatusLabel(status: string): string {
  switch (status) {
    case 'RECEPCIONADO_BODEGA_GENERAL':
    case 'PENDIENTE_INGRESO_BODEGA':
      return 'Pendiente de Ingreso a Bodega General';
    case 'in_central_warehouse':
    case 'INGRESADO_BODEGA':
      return 'Ingresado a Bodega General';
    case 'returned':
    case 'DEVUELTO_BLOQUE':
      return 'Devuelto';
    default:
      return status || '---';
  }
}

export function resolveUnitStatus(rec: any, unit: any[]): { status: string; label: string } {
  const sapTransferId = resolveUnitSapTransferId(rec, unit);
  const sapDoc = (rec.sap_transfer_documents || []).find((d: any) => d.id === sapTransferId);
  const sapStatus = sapDoc?.status;

  if (sapStatus === 'DEVUELTO_BLOQUE') {
    return { status: 'returned', label: 'Devuelto' };
  }

  const seriesStatuses = unit.map((u) => u?.current_status).filter(Boolean);
  if (seriesStatuses.length > 0 && seriesStatuses.every((s) => s === 'returned')) {
    return { status: 'returned', label: 'Devuelto' };
  }

  const seriesStatus = unit.find((u) => u?.current_status)?.current_status;

  if (seriesStatus === 'returned') {
    return { status: 'returned', label: 'Devuelto' };
  }
  if (seriesStatus === 'RECEPCIONADO_BODEGA_GENERAL' || sapStatus === 'PENDIENTE_INGRESO_BODEGA') {
    return {
      status: 'RECEPCIONADO_BODEGA_GENERAL',
      label: 'Pendiente de Ingreso a Bodega General',
    };
  }
  if (seriesStatus) {
    return { status: seriesStatus, label: formatUnitStatusLabel(seriesStatus) };
  }
  return { status: '---', label: '---' };
}

/** Guía específica ingresada para esta unidad (no todas las guías del lote) */
export function resolveUnitGuide(rec: any, unit: any[]): string {
  const os = unit.find((u) => u?.service_orders);
  const rg = os?.service_orders?.reception_guides;
  const fromOs = Array.isArray(rg) ? rg[0]?.guide_number : rg?.guide_number;
  if (fromOs) return fromOs;

  const rgById = findReceptionGuideById(rec, os?.service_orders?.reception_guide_id);
  if (rgById?.guide_number) return rgById.guide_number;

  const rawNotes = rec.notes || '';
  const serials = unit.map((u) => u?.serial_number).filter(Boolean);

  if (rec.processed_guides?.length) {
    for (const g of rec.processed_guides) {
      const gEscaped = g.replace(/[-'']/g, '\\$&');
      const guideBlockRegex = new RegExp(
        `\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|---|$)`,
        'i'
      );
      const block = rawNotes.match(guideBlockRegex)?.[0];
      if (block && serials.some((sn) => block.includes(sn))) return g;
    }
    if (rec.processed_guides.length === 1) return rec.processed_guides[0];
  }

  if (rec.reception_guides?.length === 1) {
    return rec.reception_guides[0].guide_number;
  }

  return rec.guide_number || '---';
}

export function formatPersonName(raw: string): string {
  const name = raw.split('@')[0].trim();
  if (!name) return '---';
  if (name.includes(' ')) {
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** Solo el nombre de quien clasificó en Backoffice (sin email, sin lista concatenada) */
export function getBackofficeClassifierName(rec: any, unitGuide?: string): string {
  const notes = rec.notes || '';

  if (unitGuide) {
    const gEscaped = unitGuide.replace(/[-'']/g, '\\$&');
    const perGuide = notes.match(
      new RegExp(
        `CLASIFICACIÓN \\(Guía [^)]*${gEscaped}[^)]*\\):[^\\n]*Por:\\s*([^\\n]+)`,
        'i'
      )
    );
    if (perGuide?.[1]) return formatPersonName(perGuide[1]);
  }

  const classifMatches = [...notes.matchAll(/CLASIFICACIÓN[^\n]*Por:\s*([^\n]+)/gi)];
  if (classifMatches.length > 0) {
    return formatPersonName(classifMatches[classifMatches.length - 1][1]);
  }

  return '---';
}

/** Unidades con todas las series requeridas por línea de manifiesto */
export function countReadyEquipmentUnits(guideItems: { cantidad: number; seriesPerUnit: number; series: string[][] }[]): number {
  return guideItems.reduce((sum, item) => {
    return (
      sum +
      item.series.filter(
        (u) => Array.isArray(u) && u.length >= item.seriesPerUnit && String(u[0] || '').trim()
      ).length
    );
  }, 0);
}

/** Recepción con notas de clasificación pero sin OS TC-XXX en series (ingreso a medias) */
export function receptionHasTcOs(rec: any): boolean {
  return (rec.series || []).some(
    (s: any) => s?.service_orders?.os_label && isTcServiceOrderLabel(s.service_orders.os_label)
  );
}

export function findOrphanClassifications(records: any[], search: string): any[] {
  const q = search.trim().toLowerCase();
  if (!q) return [];
  return records.filter((rec) => {
    if ((rec.source || '').toLowerCase() !== 'cac') return false;
    if (receptionHasTcOs(rec)) return false;
    const notes = (rec.notes || '').toLowerCase();
    const hasClassif =
      notes.includes('clasificación') ||
      notes.includes('detalles backoffice') ||
      notes.includes('backoffice_agency:');
    if (!hasClassif) return false;
    const guide = (rec.guide_number || '').toLowerCase();
    const processed = (rec.processed_guides || []).map((g: string) => g.toLowerCase());
    return (
      guide.includes(q) ||
      notes.includes(q) ||
      processed.some((g: string) => g.includes(q))
    );
  });
}

/** Busca en S1–S4, guía courier, guía recepción o documento SAP */
export function unitEntryMatchesSearch(entry: HistoryUnitEntry, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if (entry.unit.some((s) => (s?.serial_number || '').toLowerCase().includes(q))) return true;
  if ((entry.unitGuide || '').toLowerCase().includes(q)) return true;
  if ((entry.unitSap || '').toLowerCase().includes(q)) return true;
  if ((entry.rec?.guide_number || '').toLowerCase().includes(q)) return true;
  if ((entry.osLabel || '').toLowerCase().includes(q)) return true;
  return false;
}

/** @deprecated use unitEntryMatchesSearch */
export function unitEntryMatchesSerialSearch(entry: HistoryUnitEntry, search: string): boolean {
  return unitEntryMatchesSearch(entry, search);
}

export function filterUnitEntriesBySearch(entries: HistoryUnitEntry[], search: string): HistoryUnitEntry[] {
  const q = search.trim();
  if (!q) return entries;
  return entries.filter((e) => unitEntryMatchesSearch(e, q));
}

export type HistoryTrayFilters = {
  guide: string;
  pilot: string;
  courier: string;
  receivedBy: string;
  status: string;
  osLabel: string;
  sapDocument: string;
  techId: string;
  brandId: string;
  modelId: string;
  agencyId: string;
};

export const EMPTY_HISTORY_TRAY_FILTERS: HistoryTrayFilters = {
  guide: '',
  pilot: '',
  courier: '',
  receivedBy: '',
  status: '',
  osLabel: '',
  sapDocument: '',
  techId: '',
  brandId: '',
  modelId: '',
  agencyId: '',
};

function includesFilterText(haystack: string | undefined | null, needle: string): boolean {
  if (!needle.trim()) return true;
  return (haystack || '').toLowerCase().includes(needle.trim().toLowerCase());
}

export function hasActiveHistoryTrayFilters(filters: HistoryTrayFilters): boolean {
  return Object.values(filters).some((v) => String(v || '').trim() !== '');
}

export function filterUnitEntriesByTrayFilters(
  entries: HistoryUnitEntry[],
  filters: HistoryTrayFilters,
  ctx: {
    techIdFromModel: (modelId: string) => string | undefined;
    agencyLabelFromId?: (agencyId: string) => string;
  }
): HistoryUnitEntry[] {
  if (!hasActiveHistoryTrayFilters(filters)) return entries;

  return entries.filter((entry) => {
    const rec = entry.rec;
    const piloto = rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '';
    const classifier = getBackofficeClassifierName(rec, entry.unitGuide);

    if (!includesFilterText(entry.unitGuide, filters.guide)) return false;
    if (!includesFilterText(piloto, filters.pilot)) return false;
    if (!includesFilterText(rec.carrier, filters.courier)) return false;
    if (!includesFilterText(classifier, filters.receivedBy)) return false;
    if (!includesFilterText(entry.unitStatusLabel, filters.status)) return false;
    if (!includesFilterText(entry.osLabel, filters.osLabel)) return false;
    if (!includesFilterText(entry.unitSap, filters.sapDocument)) return false;

    if (filters.techId && ctx.techIdFromModel(entry.grp.modelId) !== filters.techId) return false;
    if (filters.brandId && entry.grp.brandId !== filters.brandId) return false;
    if (filters.modelId && entry.grp.modelId !== filters.modelId) return false;

    if (filters.agencyId) {
      const raw = (entry.unitAgencyRaw || '').toLowerCase().trim();
      const code = filters.agencyId.toLowerCase();
      const name = (ctx.agencyLabelFromId?.(filters.agencyId) || '').toLowerCase().trim();
      const matches =
        raw === code ||
        raw.includes(code) ||
        (name && (raw === name || raw.includes(name)));
      if (!matches) return false;
    }

    return true;
  });
}

export function filterUnitEntriesBySerial(entries: HistoryUnitEntry[], search: string): HistoryUnitEntry[] {
  return filterUnitEntriesBySearch(entries, search);
}

/** Expande recepciones CAC a filas de unidad con OS TC-XXX */
export function collectTcHistoryUnitEntries(
  records: any[],
  resolveSeriesPerUnit: (modelId: string) => number = () => 1
): HistoryUnitEntry[] {
  const entries: HistoryUnitEntry[] = [];

  for (const rec of records) {
    if ((rec.source || '').toLowerCase() !== 'cac') continue;

    const equipmentUnits = groupSeriesIntoEquipmentUnits(rec.series || [], resolveSeriesPerUnit);

    for (let gi = 0; gi < equipmentUnits.length; gi++) {
      const { modelId, brandId, unit } = equipmentUnits[gi];
      const grp = { modelId, brandId, fullSeries: unit };
      const osLabel =
        unit.find((u: any) => u?.service_orders?.os_label)?.service_orders?.os_label || '---';
      if (!isTcServiceOrderLabel(osLabel)) continue;

      const unitGuide = resolveUnitGuide(rec, unit);
      const unitSap = resolveUnitSap(rec, unitGuide, unit);
      const { status: unitStatus, label: unitStatusLabel } = resolveUnitStatus(rec, unit);
      const classifiedAt = resolveUnitClassifiedAt(rec, unit, unitGuide);

      entries.push({
        rec,
        grp,
        unit,
        unitIndex: 0,
        groupIndex: gi,
        osLabel,
        unitGuide,
        unitAgencyRaw: resolveUnitAgencyRaw(rec, unitGuide, unit),
        unitSap,
        unitStatus,
        unitStatusLabel,
        sapTransferId: resolveUnitSapTransferId(rec, unit),
        sortAt: classifiedAt,
        classifiedAtIso: new Date(classifiedAt).toISOString(),
      });
    }
  }

  return entries.sort((a, b) => {
    if (b.sortAt !== a.sortAt) return b.sortAt - a.sortAt;
    const osA = parseInt((a.osLabel || '').replace(/\D/g, ''), 10) || 0;
    const osB = parseInt((b.osLabel || '').replace(/\D/g, ''), 10) || 0;
    return osB - osA;
  });
}

export function formatHistoryHourLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const datePart = d.toLocaleDateString('es-GT', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const hour = d.getHours().toString().padStart(2, '0');
  return `${datePart} — ${hour}:00 hrs`;
}

export function getHistoryHourKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
}
