import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkshopTreatmentEvidence } from '@/modules/workshop/domain/workshopTreatment';
import { collectWorkshopCatalogIds } from '@/modules/workshop/shared/workshopHistoryDisplay';

export const WORKSHOP_REPAIR_EVIDENCE_ACTIONS = [
  'REPARACIÓN CORREGIDA EN QC',
  'REPARACIÓN COMPLETADA',
  'REPARACIÓN L3 COMPLETADA',
  'CONTROL DE CALIDAD COMPLETADO',
] as const;

export const WORKSHOP_REACOND_EVIDENCE_ACTION = 'REACONDICIONADO COMPLETADO';

const WORKSHOP_TREATMENT_ACTIONS = [
  ...WORKSHOP_REPAIR_EVIDENCE_ACTIONS,
  WORKSHOP_REACOND_EVIDENCE_ACTION,
] as const;

const DEFAULT_PAGE_SIZE = 1_000;
const SERIES_CHUNK_SIZE = 80;

export type WorkshopAuditEvidenceRow = {
  id: string;
  record_id: string | null;
  action: string | null;
  new_values: Record<string, unknown> | null;
  created_at: string | null;
};

type AuditPageError = { message: string };

type ReadAuditPage = (page: {
  seriesIds: string[];
  from: number;
  to: number;
}) => Promise<{
  rows: WorkshopAuditEvidenceRow[];
  error: AuditPageError | null;
}>;

export class WorkshopTreatmentEvidenceLoadError extends Error {
  readonly pageFrom: number;
  readonly seriesIds: string[];

  constructor(message: string, context: { pageFrom: number; seriesIds: string[] }) {
    super(message);
    this.name = 'WorkshopTreatmentEvidenceLoadError';
    this.pageFrom = context.pageFrom;
    this.seriesIds = [...context.seriesIds];
  }
}

function normalizedIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function extractRepairIds(payload: Record<string, unknown>): string[] {
  const repairs = normalizedIds(payload.repairs);
  if (repairs.length > 0) return repairs;
  const items = normalizedIds(payload.items);
  if (items.length > 0) return items;
  return collectWorkshopCatalogIds(payload);
}

function emptyEvidence(): WorkshopTreatmentEvidence {
  return { hasAddedRepair: false, passedReacondicionado: false };
}

export async function loadWorkshopTreatmentEvidenceFromPages(input: {
  seriesIds: string[];
  readPage: ReadAuditPage;
  pageSize?: number;
}): Promise<Map<string, WorkshopTreatmentEvidence>> {
  const seriesIds = [...new Set(input.seriesIds.map(String).filter(Boolean))];
  const evidence = new Map(seriesIds.map((id) => [id, emptyEvidence()]));
  if (seriesIds.length === 0) return evidence;

  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new RangeError(`pageSize must be an integer between 1 and ${DEFAULT_PAGE_SIZE}`);
  }

  for (let from = 0; ; from += pageSize) {
    const { rows, error } = await input.readPage({
      seriesIds,
      from,
      to: from + pageSize - 1,
    });

    if (error) {
      throw new WorkshopTreatmentEvidenceLoadError(
        `Could not load workshop treatment evidence: ${error.message}`,
        { pageFrom: from, seriesIds },
      );
    }

    for (const row of rows) {
      const seriesId = String(row.record_id || '');
      const current = evidence.get(seriesId);
      if (!current) continue;

      const action = String(row.action || '');
      if (action === WORKSHOP_REACOND_EVIDENCE_ACTION) {
        current.passedReacondicionado = true;
      } else if (
        (WORKSHOP_REPAIR_EVIDENCE_ACTIONS as readonly string[]).includes(action) &&
        extractRepairIds(row.new_values || {}).length > 0
      ) {
        current.hasAddedRepair = true;
      }
    }

    if (rows.length < pageSize) return evidence;
  }
}

async function readSupabaseAuditPage(
  supabase: SupabaseClient,
  page: { seriesIds: string[]; from: number; to: number },
): Promise<{ rows: WorkshopAuditEvidenceRow[]; error: AuditPageError | null }> {
  const { data, error } = await supabase
    .from('erp_audit_logs')
    .select('id, record_id, action, new_values, created_at')
    .in('record_id', page.seriesIds)
    .in('action', [...WORKSHOP_TREATMENT_ACTIONS])
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(page.from, page.to);

  return {
    rows: (data || []) as WorkshopAuditEvidenceRow[],
    error: error ? { message: error.message } : null,
  };
}

export async function loadWorkshopTreatmentEvidence(
  supabase: SupabaseClient,
  seriesIds: string[],
): Promise<Map<string, WorkshopTreatmentEvidence>> {
  const uniqueIds = [...new Set(seriesIds.map(String).filter(Boolean))];
  const combined = new Map(uniqueIds.map((id) => [id, emptyEvidence()]));

  for (let index = 0; index < uniqueIds.length; index += SERIES_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + SERIES_CHUNK_SIZE);
    const chunkEvidence = await loadWorkshopTreatmentEvidenceFromPages({
      seriesIds: chunk,
      readPage: (page) => readSupabaseAuditPage(supabase, page),
    });
    for (const [seriesId, value] of chunkEvidence) combined.set(seriesId, value);
  }

  return combined;
}
