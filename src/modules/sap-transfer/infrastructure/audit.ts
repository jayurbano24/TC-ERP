export async function auditClassifiedSeries(
  seriesIds: string[],
  sapTransferId: string,
  registeredBy: string
) {
  if (!seriesIds.length) return;
  const { logAudit } = await import('@/lib/database/audit');
  for (const seriesId of seriesIds) {
    await logAudit('series', seriesId, 'RECEPCIÓN CAC', {
      status: 'RECEPCIONADO_BODEGA_GENERAL',
      source: 'cac',
      sap_transfer_id: sapTransferId,
      registered_by: registeredBy,
    });
  }
}

export function formatSupabaseNetworkError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.';
  }
  return msg || fallback;
}
