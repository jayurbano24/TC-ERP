import {
  buildEquipmentSerialSlots,
  coalesceMaterialLote,
  looksLikeMac,
  type SerialPickRow,
} from '@/lib/sap/equipmentSerialSlots';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import type { ReportRow } from '../../domain/types/report.types';
import { resolveEntrySource, type EntrySource } from '@/modules/workshop/shared/entrySource';
import { labelModelPortfolioVigencia } from '@/shared/catalogs/modelPortfolioVigencia';
import { labelPrediagnosticoDictamen } from '@/shared/catalogs/prediagnosticoDictamenLabels';
import {
  buildPrediagnosticoExportColumns,
  PREDIAGNOSTICO_BASE_EXPORT_COLUMNS,
} from './prediagnostico-export-catalog';
import type { PrediagnosticoCheckItem } from './prediagnostico-report-format';

/** @deprecated Usar buildPrediagnosticoExportColumns(catalogItems) */
export function getPrediagnosticoContractColumnsFallback(
  catalogItems: PrediagnosticoCheckItem[] = []
): string[] {
  return buildPrediagnosticoExportColumns(catalogItems);
}

export { PREDIAGNOSTICO_BASE_EXPORT_COLUMNS, buildPrediagnosticoExportColumns };

/** Extrae «Zona N» de notas de recepción, agencia, courier o proveedor PX. */
export function extractZonaLabel(...texts: (string | null | undefined)[]): string {
  for (const raw of texts) {
    const t = String(raw ?? '');
    const m = t.match(/\bZONA\s*(\d+)\b/i);
    if (m) return `Zona ${m[1]}`;
  }
  return '';
}

/**
 * Procedencia contractual SCA (ej. Planta Externa · Aliados Bodega Central Zona 3 · Zona 3).
 * No incluye courier en el texto — va en otros campos operativos si aplica.
 */
export function formatProcedenciaScaReport(input: {
  entrySource: EntrySource | null;
  receptionNotes?: string | null;
  agencyName?: string | null;
  carrier?: string | null;
  guideNumber?: string | null;
}): string {
  const notes = String(input.receptionNotes ?? '');
  const agency = String(input.agencyName ?? '');
  const carrier = String(input.carrier ?? '');
  const zona = extractZonaLabel(notes, agency, carrier);

  let src = input.entrySource;
  if (!src) {
    const guide = String(input.guideNumber ?? '').trim().toUpperCase();
    if (guide.startsWith('REC-')) src = 'px';
    else if (/\bPX\b/i.test(notes) || /Proveedor PX:/i.test(notes)) src = 'px';
    else if (/\bCAC\b/i.test(notes)) src = 'cac';
  }

  if (src === 'px') return 'Planta Externa';

  if (src === 'cac') {
    if (zona) return `Aliados Bodega Central ${zona}`;
    return 'CAC';
  }

  if (zona) return zona;

  return 'Recuperación / Otros';
}

/** @deprecated Usar formatProcedenciaScaReport */
export function formatProcedenciaContract(source: EntrySource | null, carrier?: string): string {
  return formatProcedenciaScaReport({
    entrySource: source,
    carrier,
  });
}

/** Marca + modelo + código material/SAP como SKU. */
export function formatMarcaModeloSku(marca: string, modelo: string, sku: string): string {
  const brand = marca.trim();
  const model = modelo.trim();
  const code = sku.trim();
  const label = [brand, model].filter(Boolean).join(' ').trim();
  if (!label && !code) return '';
  if (!code) return label;
  return label ? `${label} · SKU ${code}` : `SKU ${code}`;
}

/** Vigencia SCA desde catálogo de modelos (`models.portfolio_vigencia`). */
export function formatVigenciaContract(
  _valuationLegacy: string,
  portfolioVigencia?: string | null,
): string {
  return labelModelPortfolioVigencia(portfolioVigencia ?? 'vigente');
}

export function formatPrediagnosticoDictamenLabel(dictamen: string): string {
  if (!dictamen.trim()) return '';
  return labelPrediagnosticoDictamen(dictamen);
}

export function formatPrediagnosticoClaseLabel(clase: string): string {
  const c = clase.trim();
  if (!c) return '';
  return /^clase\s/i.test(c) ? c : `Clase ${c}`;
}

export function formatPrediagnosticoObservacionesExport(observaciones?: string | null): string {
  const notes = String(observaciones ?? '').trim();
  if (!notes || notes.startsWith('[BACKFILL]')) return '';
  return notes;
}

/** Texto único legacy (UI / logs); el Excel usa columnas separadas. */
export function formatPrediagnosticoContractField(input: {
  dictamen: string;
  clase: string;
  diagnostico: string;
  accion: string;
  observaciones?: string;
}): string {
  const dictamen = formatPrediagnosticoDictamenLabel(input.dictamen) || 'Sin dictamen';
  const parts: string[] = [dictamen];
  const clase = formatPrediagnosticoClaseLabel(input.clase);
  if (clase) parts.push(clase);
  if (input.diagnostico.trim()) parts.push(input.diagnostico.trim());
  if (input.accion.trim()) parts.push(`Acción: ${input.accion.trim()}`);
  let text = parts.join(' · ');
  const notes = formatPrediagnosticoObservacionesExport(input.observaciones);
  if (notes) text = `${text} — ${notes}`;
  return text;
}

/**
 * Agencia / aliado de recuperación: SAP (`sap_transfer_documents.agency`), guía CAC,
 * notas Backoffice_Agency, o zona PX cuando procedencia es Planta Externa.
 */
export function resolveAgenciaRecuperacionSca(input: {
  guideAgency?: string | null;
  sapAgency?: string | null;
  receptionNotes?: string | null;
  carrier?: string | null;
  entrySource?: EntrySource | null;
}): string {
  const carrier = input.carrier ?? null;
  const fromSap = sanitizeCacAgencyRaw(String(input.sapAgency ?? ''), carrier);
  if (fromSap && !/^backoffice_/i.test(fromSap)) return fromSap;

  const fromGuide = sanitizeCacAgencyRaw(String(input.guideAgency ?? ''), carrier);
  if (fromGuide && !/^backoffice_/i.test(fromGuide)) return fromGuide;

  const notes = String(input.receptionNotes ?? '');
  const fromNotes = notes.match(/Backoffice_Agency:\s*([^\n\r]*)/i)?.[1]?.trim();
  const fromBlock = sanitizeCacAgencyRaw(fromNotes ?? '', carrier);
  if (fromBlock && !/^backoffice_/i.test(fromBlock)) return fromBlock;

  if (input.entrySource === 'px') {
    const zona = extractZonaLabel(notes);
    if (zona) return zona;
  }

  const zona = extractZonaLabel(notes);
  if (zona && input.entrySource === 'cac') return zona;

  return '';
}

export function resolveSkuMaterialSap(
  unitMaterial: string | null | undefined,
  siblings: Array<{ material?: string | null; valuation?: string | null }>
): string {
  const direct = String(unitMaterial ?? '').trim();
  if (direct) return direct;
  return coalesceMaterialLote(siblings).material;
}

export function formatIngressDateGt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export type PrediagnosticoSerialMap = {
  serie: string;
  mac: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  primaryId: string;
};

/** Mapa S1–S4 por OS (hermanas + columnas legacy s2–s4), una fila de reporte por equipo. */
export function resolvePrediagnosticoEquipmentSerials(
  siblings: SerialPickRow[],
  mainSerial?: string | null,
  fallbackSerial?: string
): PrediagnosticoSerialMap {
  if (siblings.length === 0) {
    const s = String(fallbackSerial || mainSerial || '').trim();
    return {
      serie: s,
      mac: looksLikeMac(s) ? s : '',
      s1: s,
      s2: '',
      s3: '',
      s4: '',
      primaryId: '',
    };
  }
  const slots = buildEquipmentSerialSlots(siblings, mainSerial);
  const mac =
    [slots.s2, slots.s3, slots.s4, slots.s1].find((v) => v && looksLikeMac(v)) || '';
  const serie = slots.s1 || String(fallbackSerial || '').trim();
  return {
    serie,
    mac,
    s1: slots.s1,
    s2: slots.s2,
    s3: slots.s3,
    s4: slots.s4,
    primaryId: slots.primary.id,
  };
}

export function resolveSerialAndMac(
  siblings: SerialPickRow[],
  mainSerial?: string | null,
  fallbackSerial?: string,
): { serie: string; mac: string } {
  const map = resolvePrediagnosticoEquipmentSerials(siblings, mainSerial, fallbackSerial);
  return { serie: map.serie, mac: map.mac };
}

export function resolveProcedenciaFromSeries(input: {
  entry_source?: string | null;
  receptionSource?: string | null;
  receptionNotes?: string | null;
  agencyName?: string | null;
  guide?: string | null;
  serial?: string | null;
  carrier?: string | null;
}): string {
  const src = resolveEntrySource({
    entry_source: input.entry_source,
    receptions: input.receptionSource ? { source: input.receptionSource } : null,
    guide: input.guide,
    serial: input.serial,
  });
  return formatProcedenciaScaReport({
    entrySource: src,
    receptionNotes: input.receptionNotes,
    agencyName: input.agencyName,
    carrier: input.carrier,
    guideNumber: input.guide,
  });
}

export function buildPrediagnosticoContractRow(parts: {
  rowNumber?: number;
  numeroIngresoSca: string;
  procedencia: string;
  agencia: string;
  marca: string;
  modelo: string;
  sku: string;
  numeroTrasladoSap: string;
  serie: string;
  mac: string;
  s1?: string;
  s2?: string;
  s3?: string;
  s4?: string;
  tecnologia: string;
  vigencia: string;
  fechaIngreso: string;
  dictamen: string;
  checkCells: Record<string, string>;
  observaciones: string;
}): ReportRow {
  const row: ReportRow = {
    'N.º': parts.rowNumber != null ? String(parts.rowNumber) : '',
    'Número de ingreso al SCA': parts.numeroIngresoSca.trim(),
    Procedencia: parts.procedencia.trim(),
    'Agencia, Central o Aliado de recuperación': parts.agencia.trim(),
    Marca: parts.marca.trim(),
    Modelo: parts.modelo.trim(),
    SKU: parts.sku.trim(),
    'Número de traslado SAP': parts.numeroTrasladoSap.trim(),
    Serie: parts.serie.trim(),
    MAC: parts.mac.trim(),
    S1: (parts.s1 ?? parts.serie).trim(),
    S2: (parts.s2 ?? '').trim(),
    S3: (parts.s3 ?? '').trim(),
    S4: (parts.s4 ?? '').trim(),
    Tecnología: parts.tecnologia.trim(),
    Vigencia: parts.vigencia.trim(),
    'Fecha de ingreso': parts.fechaIngreso.trim(),
    Dictamen: parts.dictamen.trim(),
    Observaciones: parts.observaciones.trim(),
  };
  for (const [key, value] of Object.entries(parts.checkCells)) {
    row[key] = value;
  }
  return row;
}

/** Renumera N.º y garantiza todas las columnas del contrato (export tabular). */
export function finalizePrediagnosticoContractRows(
  rows: ReportRow[],
  columns: string[]
): ReportRow[] {
  return rows.map((row, index) => {
    const out: ReportRow = {};
    for (const col of columns) {
      if (col === 'N.º') {
        out[col] = index + 1;
      } else {
        out[col] = row[col] != null ? String(row[col]) : '';
      }
    }
    return out;
  });
}
