import { apiFetch, isApiAuthFailure, redirectToLogin } from '@/lib/http/apiFetch';
import type { DashboardMetrics } from '@/lib/database/kpi';

async function handleKpiResponse(res: Response): Promise<Response> {
  if (!isApiAuthFailure(res.status, null)) return res;
  redirectToLogin();
  await new Promise(() => {});
  return res;
}

export type WorkshopOsByStage = {
  diagnostico: number;
  reparacion: number;
  reacondicionado: number;
  qc: number;
  l3: number;
  scraps: number;
};

export type KpiPipelineSnapshot = {
  recepcion: number;
  backoffice: number;
  taller: number;
  bodega: number;
  despacho: number;
  workshopOs: WorkshopOsByStage;
  refreshedAt: string | null;
};

export async function fetchDashboardMetricsFromApi(
  timeRange: string
): Promise<{ metrics: DashboardMetrics; source: string }> {
  const res = await handleKpiResponse(
    await apiFetch(
      `/api/v1/kpi/dashboard-metrics?timeRange=${encodeURIComponent(timeRange)}`
    )
  );
  if (!res.ok) {
    throw new Error(`KPI metrics API ${res.status}`);
  }
  const body = await res.json();
  return { metrics: body.metrics, source: body.source };
}

export async function fetchPipelineFromApi(): Promise<{
  pipeline: KpiPipelineSnapshot | null;
  source: string;
}> {
  const res = await handleKpiResponse(await apiFetch('/api/v1/kpi/pipeline'));
  if (!res.ok) {
    throw new Error(`KPI pipeline API ${res.status}`);
  }
  const body = await res.json();
  return { pipeline: body.pipeline, source: body.source };
}

export async function fetchWorkshopOsCountsFromApi(): Promise<WorkshopOsByStage | null> {
  const res = await apiFetch('/api/v1/workshop/counts');
  if (!res.ok) return null;
  const body = await res.json();
  const c = body.counts as Record<string, number> | undefined;
  if (!c) return null;
  return {
    diagnostico: c.diagnostico ?? 0,
    reparacion: c.reparacion ?? 0,
    reacondicionado: c.reacondicionado ?? 0,
    qc: c.qc ?? 0,
    l3: c.l3 ?? 0,
    scraps: c.scraps ?? 0,
  };
}
