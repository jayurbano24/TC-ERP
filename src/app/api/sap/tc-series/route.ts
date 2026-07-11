import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;

/**
 * Devuelve TODAS las series TC con service_order_id (paginado).
 * ADR-011 2A: USE_RLS_READS=true → cliente JWT.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;
  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, { module: 'sap', action: 'tc-series' });
  if (denied) return denied;
  const { client: supabase } = resolveReadClient(auth.supabase);

  try {
    const series: { id: string; serial_number: string; service_order_id: string; serial_normalized?: string | null }[] = [];
    let from = 0;
    for (;;) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('series')
        .select('id, serial_number, service_order_id, serial_normalized')
        .not('service_order_id', 'is', null)
        .range(from, to);
      if (error) throw error;
      const batch = data || [];
      series.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const equipos: { id: string; main_serial: string | null }[] = [];
    from = 0;
    for (;;) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('service_orders')
        .select('id, main_serial')
        .range(from, to);
      if (error) throw error;
      const batch = data || [];
      equipos.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return NextResponse.json({
      success: true,
      series,
      equipos,
      meta: { seriesCount: series.length, equiposCount: equipos.length },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fetching TC series:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
