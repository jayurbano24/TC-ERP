import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import {
  extractGuideDetailsBlockForUnit,
  findReceptionGuide,
  findReceptionGuideById,
  sapDocsForReceptionGuide,
} from './guideNotes';

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
    case 'dispatched':
      return 'Despachado';
    default:
      return status || '---';
  }
}

export function resolveUnitStatus(rec: any, unit: any[]): { status: string; label: string } {
  const seriesStatuses = unit.map((u) => u?.current_status).filter(Boolean);

  if (
    seriesStatuses.length > 0 &&
    seriesStatuses.every((s) => s === 'dispatched' || s === 'in_scraps')
  ) {
    return { status: 'dispatched', label: 'Despachado' };
  }

  const sapTransferId = resolveUnitSapTransferId(rec, unit);
  const sapDoc = (rec.sap_transfer_documents || []).find((d: any) => d.id === sapTransferId);
  const sapStatus = sapDoc?.status;

  if (sapStatus === 'DESPACHADO') {
    return { status: 'dispatched', label: 'Despachado' };
  }

  if (sapStatus === 'DEVUELTO_BLOQUE') {
    return { status: 'returned', label: 'Devuelto' };
  }

  if (seriesStatuses.length > 0 && seriesStatuses.every((s) => s === 'returned')) {
    return { status: 'returned', label: 'Devuelto' };
  }

  const seriesStatus = unit.find((u) => u?.current_status)?.current_status;

  if (seriesStatus === 'dispatched') {
    return { status: 'dispatched', label: 'Despachado' };
  }
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
