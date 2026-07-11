import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { TECHNOLOGY_SELECT } from '@/shared/constants/dbProjections';
import type { SupabaseClient } from '@supabase/supabase-js';

type TechStatRow = {
  technology_id: string;
  total_boxes: number;
  total_units: number;
  tech_name?: string;
};

type DashboardTotals = {
  total_boxes: number;
  total_equipos: number;
  cajas_completas: number;
  cajas_parciales: number;
};

async function attachTechNames(
  supabase: SupabaseClient,
  statsArray: TechStatRow[]
): Promise<TechStatRow[]> {
  const techIds = [
    ...new Set(statsArray.map((s) => s.technology_id).filter((id) => id && id !== 'UNKNOWN')),
  ] as string[];

  const techNameById = new Map<string, string>();
  if (techIds.length > 0) {
    const { data: techRows } = await supabase
      .from('technologies')
      .select(TECHNOLOGY_SELECT)
      .in('id', techIds);
    for (const t of techRows ?? []) {
      techNameById.set(t.id, t.name ?? '---');
    }
  }

  return statsArray.map((s) => ({
    ...s,
    tech_name: s.technology_id === 'UNKNOWN' ? '---' : techNameById.get(s.technology_id) ?? '---',
  }));
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  if (!supabase) {
    return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
  }

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'stats',
  });
  if (roleCheck) return roleCheck;

  const { data: kpiData, error: kpiError } = await supabase.rpc('warehouse_dashboard_kpis');

  if (!kpiError && kpiData) {
    const payload = kpiData as {
      totals?: DashboardTotals;
      by_technology?: Array<{
        technology_id: string | null;
        total_boxes: number;
        total_equipos: number;
      }>;
    };

    const statsArray: TechStatRow[] = (payload.by_technology || [])
      .map((row) => ({
        technology_id: row.technology_id || 'UNKNOWN',
        total_boxes: Number(row.total_boxes || 0),
        total_units: Number(row.total_equipos || 0),
      }))
      .sort((a, b) => b.total_units - a.total_units);

    const stats = await attachTechNames(supabase, statsArray);
    const totals: DashboardTotals = {
      total_boxes: Number(payload.totals?.total_boxes || 0),
      total_equipos: Number(payload.totals?.total_equipos || 0),
      cajas_completas: Number(payload.totals?.cajas_completas || 0),
      cajas_parciales: Number(payload.totals?.cajas_parciales || 0),
    };

    return NextResponse.json({ stats, totals, unit: 'equipos' });
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('warehouse_stats_by_technology');

  if (rpcError) {
    console.error('warehouse stats:', kpiError?.message || rpcError.message);
    return NextResponse.json(
      { error: 'FAILED_TO_LOAD_SUMMARY: ' + (kpiError?.message || rpcError.message) },
      { status: 500 }
    );
  }

  const statsArray: TechStatRow[] = (rpcData || [])
    .map((row: { technology_id: string | null; total_boxes: number; total_units: number }) => ({
      technology_id: row.technology_id || 'UNKNOWN',
      total_boxes: Number(row.total_boxes || 0),
      total_units: Number(row.total_units || 0),
    }))
    .sort((a, b) => b.total_units - a.total_units);

  const stats = await attachTechNames(supabase, statsArray);
  const totals: DashboardTotals = {
    total_boxes: stats.reduce((sum, s) => sum + s.total_boxes, 0),
    total_equipos: stats.reduce((sum, s) => sum + s.total_units, 0),
    cajas_completas: 0,
    cajas_parciales: 0,
  };

  return NextResponse.json({
    stats,
    totals,
    unit: 'equipos',
    mode: 'legacy',
  });
}
