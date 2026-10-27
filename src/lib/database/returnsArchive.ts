import { apiFetch } from '@/lib/http/apiFetch';

export type ArchiveReturnRecordInput = {
  receptionId?: string;
  seriesIds?: string[];
};

export type ArchiveReturnRecordResult = {
  error?: string;
  idempotencyKey?: string;
};

export async function archiveReturnRecord(
  input: ArchiveReturnRecordInput
): Promise<ArchiveReturnRecordResult> {
  const res = await apiFetch('/api/v1/returns/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as ArchiveReturnRecordResult & { error?: string };
  if (!res.ok) {
    return { error: data.error ?? `HTTP ${res.status}` };
  }
  return data;
}
