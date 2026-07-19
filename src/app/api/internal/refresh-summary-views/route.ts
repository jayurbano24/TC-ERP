/**
 * Cron/worker: refresca materialized views (Fase 3).
 * Protegido por CRON_SECRET — no expone service_role al cliente.
 */
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { rpcInternal } from '@/lib/supabase/rpcInternal';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await rpcInternal(supabase, 'refresh_enterprise_summary_views');

  if (error?.code === '42883' || error?.code === 'PGRST202' || error?.code === 'PGRST106') {
    return NextResponse.json(
      {
        error: 'RPC_NOT_DEPLOYED',
        detail: 'Aplicar migración 150 y exponer schema internal en API settings',
      },
      { status: 503 }
    );
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? null });
}
