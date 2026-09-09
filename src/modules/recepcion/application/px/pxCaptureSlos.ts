/** SLOs operativos de captura PX (Fase 5). */

export const PX_CAPTURE_SLO = {
  success: {
    p50RpcMs: 500,
    p95RpcMs: 1500,
    p99RpcMs: 3000,
    p95ClientMs: 2000,
  },
  duplicateOrBoxFull: { p95RpcMs: 1000 },
  boxBusy: { p95RpcMs: 500 },
  timeout57014DailyMax: 5,
  errorsMissingSerialDailyMax: 0,
} as const;

/** Umbrales de alertas operativas (Fase 7 — alineados a px_capture_alerts_current). */
export const PX_CAPTURE_ALERT_THRESHOLDS = {
  timeout1hCritical: 3,
  timeout24hCritical: 5,
  successP95WarningMs: 1500,
  successP95CriticalMs: 3000,
  successMinSample24h: 20,
  boxBusy1hWarning: 30,
} as const;

export type PxCaptureAlertRow = {
  alert_id: string;
  severity: 'ok' | 'warning' | 'critical';
  observed: number;
  threshold: number;
  description?: string;
};

export function pxCaptureAlertsRequireAction(alerts: PxCaptureAlertRow[]): {
  critical: PxCaptureAlertRow[];
  warning: PxCaptureAlertRow[];
} {
  const critical = alerts.filter((a) => a.severity === 'critical');
  const warning = alerts.filter((a) => a.severity === 'warning');
  return { critical, warning };
}

export type PxCaptureSloBreach = {
  metric: string;
  observed: number;
  threshold: number;
  severity: 'warning' | 'critical';
};

/** Evalúa percentiles agregados (p.ej. fila de px_capture_slo_daily). */
export function evaluatePxCaptureSloRow(row: {
  outcome: string;
  error_code: string;
  p50_rpc_ms?: number | null;
  p95_rpc_ms?: number | null;
  p99_rpc_ms?: number | null;
  p95_client_ms?: number | null;
  timeout_57014_count?: number | null;
  errors_missing_serial?: number | null;
}): PxCaptureSloBreach[] {
  const breaches: PxCaptureSloBreach[] = [];

  if (row.outcome === 'success') {
    if (row.p50_rpc_ms != null && row.p50_rpc_ms > PX_CAPTURE_SLO.success.p50RpcMs) {
      breaches.push({
        metric: 'success_p50_rpc_ms',
        observed: row.p50_rpc_ms,
        threshold: PX_CAPTURE_SLO.success.p50RpcMs,
        severity: 'warning',
      });
    }
    if (row.p95_rpc_ms != null && row.p95_rpc_ms > PX_CAPTURE_SLO.success.p95RpcMs) {
      breaches.push({
        metric: 'success_p95_rpc_ms',
        observed: row.p95_rpc_ms,
        threshold: PX_CAPTURE_SLO.success.p95RpcMs,
        severity: 'critical',
      });
    }
    if (row.p99_rpc_ms != null && row.p99_rpc_ms > PX_CAPTURE_SLO.success.p99RpcMs) {
      breaches.push({
        metric: 'success_p99_rpc_ms',
        observed: row.p99_rpc_ms,
        threshold: PX_CAPTURE_SLO.success.p99RpcMs,
        severity: 'warning',
      });
    }
    if (row.p95_client_ms != null && row.p95_client_ms > PX_CAPTURE_SLO.success.p95ClientMs) {
      breaches.push({
        metric: 'success_p95_client_ms',
        observed: row.p95_client_ms,
        threshold: PX_CAPTURE_SLO.success.p95ClientMs,
        severity: 'warning',
      });
    }
  }

  if (
    row.error_code === 'BOX_BUSY' &&
    row.p95_rpc_ms != null &&
    row.p95_rpc_ms > PX_CAPTURE_SLO.boxBusy.p95RpcMs
  ) {
    breaches.push({
      metric: 'box_busy_p95_rpc_ms',
      observed: row.p95_rpc_ms,
      threshold: PX_CAPTURE_SLO.boxBusy.p95RpcMs,
      severity: 'warning',
    });
  }

  const dupCodes = ['DUPLICATE_OPEN_OS', 'DUPLICATE_IN_RECEPTION', 'DUPLICATE_IN_OTHER_GUIDE', 'BOX_FULL'];
  if (
    dupCodes.includes(row.error_code) &&
    row.p95_rpc_ms != null &&
    row.p95_rpc_ms > PX_CAPTURE_SLO.duplicateOrBoxFull.p95RpcMs
  ) {
    breaches.push({
      metric: 'duplicate_boxfull_p95_rpc_ms',
      observed: row.p95_rpc_ms,
      threshold: PX_CAPTURE_SLO.duplicateOrBoxFull.p95RpcMs,
      severity: 'warning',
    });
  }

  if ((row.timeout_57014_count ?? 0) > PX_CAPTURE_SLO.timeout57014DailyMax) {
    breaches.push({
      metric: 'timeout_57014_daily',
      observed: row.timeout_57014_count ?? 0,
      threshold: PX_CAPTURE_SLO.timeout57014DailyMax,
      severity: 'critical',
    });
  }

  if ((row.errors_missing_serial ?? 0) > PX_CAPTURE_SLO.errorsMissingSerialDailyMax) {
    breaches.push({
      metric: 'errors_missing_serial_daily',
      observed: row.errors_missing_serial ?? 0,
      threshold: PX_CAPTURE_SLO.errorsMissingSerialDailyMax,
      severity: 'critical',
    });
  }

  return breaches;
}
