export function formatSupabaseNetworkError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Error de red al contactar Supabase. Verifique conexión e intente de nuevo.';
  }
  return msg || fallback;
}

export async function auditClassifiedSeries(
  seriesIds: string[],
  sapTransferId: string,
  registeredBy: string,
  correlationId?: string,
  sapDocumentNumber?: string
) {
  if (!seriesIds.length) return;
  const { auditClassifiedSeries: audit } = await import('@/lib/database/cacBackofficeAudit');
  await audit(seriesIds, {
    sapTransferId,
    registeredBy,
    sapDocumentNumber,
    correlationId: correlationId ?? sapTransferId,
  });
}

export async function auditClassifyBatchCompleted(
  params: {
    receptionId: string;
    sapTransferId: string;
    unitsCount: number;
    seriesCount: number;
    registeredBy: string;
    correlationId: string;
    sapDocumentNumber?: string;
  }
) {
  const { auditClassifyBatchCompleted: audit } = await import('@/lib/database/cacBackofficeAudit');
  await audit(params);
}
