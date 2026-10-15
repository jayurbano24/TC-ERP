/** Clave lógica de una fila en kpi_event_ledger (1 audit → N métricas). */
export function kpiLedgerRowKey(row: {
  audit_id: unknown;
  proceso: unknown;
  metrica: unknown;
  dimension_key?: unknown;
}): string {
  return `${String(row.audit_id)}|${String(row.proceso)}|${String(row.metrica)}|${String(
    row.dimension_key ?? 'ALL'
  )}`;
}

/** Debe coincidir con PK en migración 256_kpi_event_ledger_composite_pk.sql */
export const KPI_LEDGER_UPSERT_ON_CONFLICT = 'audit_id,proceso,metrica,dimension_key' as const;

export function filterFreshLedgerRows<T extends Record<string, unknown>>(
  ledgerRows: T[],
  existingKeys: Set<string>
): T[] {
  return ledgerRows.filter((row) => !existingKeys.has(kpiLedgerRowKey(row)));
}
