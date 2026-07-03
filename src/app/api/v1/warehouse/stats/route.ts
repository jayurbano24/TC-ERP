import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { TECHNOLOGY_SELECT } from '@/shared/constants/dbProjections';

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  if (!supabase) {
    return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('warehouse_stats_by_technology');

  if (rpcError) {
    console.error('warehouse_stats_by_technology:', rpcError.message);
    return NextResponse.json(
      { error: 'FAILED_TO_LOAD_SUMMARY: ' + rpcError.message },
      { status: 500 }
    );
  }

  const statsArray = (rpcData || [])
    .map((row: { technology_id: string | null; total_boxes: number; total_units: number }) => ({
      technology_id: row.technology_id || 'UNKNOWN',
      total_boxes: Number(row.total_boxes || 0),
      total_units: Number(row.total_units || 0),
    }))
    .sort((a, b) => b.total_units - a.total_units);

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

  const stats = statsArray.map((s) => ({
    ...s,
    tech_name: s.technology_id === 'UNKNOWN' ? '---' : techNameById.get(s.technology_id) ?? '---',
  }));

  return NextResponse.json({ stats });
}
