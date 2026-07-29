import { apiFetch, isApiAuthFailure, redirectToLogin } from '@/lib/http/apiFetch';
import type { DashboardMetrics, UserKPI } from '@/lib/database/kpi';

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
  /** Cola Equipo Listo (SSOT Taller / Despacho). */
  listo: number;
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

export async function fetchDailyUserKpisFromApi(
  timeRange: string
): Promise<{ kpis: UserKPI[]; source: string }> {
  const res = await handleKpiResponse(
    await apiFetch(`/api/v1/kpi/daily-users?timeRange=${encodeURIComponent(timeRange)}`)
  );
  if (!res.ok) {
    throw new Error(`KPI daily-users API ${res.status}`);
  }
  const body = await res.json();
  return {
    kpis: (body.kpis || []) as UserKPI[],
    source: String(body.source || 'unknown'),
  };
}

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
    listo: c.listo ?? 0,
  };
}

export type BICostBreakdownRow = {
  tech: string;
  condition: string;
  price: number;
  quantity: number;
};

export async function fetchBICostBreakdownFromApi(
  timeRange: string
): Promise<{ rows: BICostBreakdownRow[]; source: string; countedOs: number }> {
  const res = await handleKpiResponse(
    await apiFetch(
      `/api/v1/kpi/bi-cost-breakdown?timeRange=${encodeURIComponent(timeRange)}`
    )
  );
  if (!res.ok) {
    throw new Error(`KPI BI cost API ${res.status}`);
  }
  const body = await res.json();
  return {
    rows: (body.rows || []) as BICostBreakdownRow[],
    source: String(body.source || 'unknown'),
    countedOs: Number(body.countedOs || 0),
  };
}
