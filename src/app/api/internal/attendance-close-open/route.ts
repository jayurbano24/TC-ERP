/**
 * Cron: cierra jornadas abiertas sin marcaje de salida (Fase 2).
 * Protegido por CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import { recordCronHeartbeat } from '@/lib/cron/recordCronHeartbeat';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { rpcInternal } from '@/lib/supabase/rpcInternal';

async function handle(req: Request) {
  const secret =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const graceMin = Number(url.searchParams.get('graceMin') || '30');

  const supabase = getSupabaseServerClient();
  const { data, error } = await rpcInternal(supabase, 'close_open_attendance_tx', {
    p_grace_min: Number.isFinite(graceMin) ? graceMin : 30,
  });

  if (error?.code === '42883' || error?.code === 'PGRST202' || error?.code === 'PGRST106') {
    await recordCronHeartbeat(supabase, 'cron_attendance_close_open', {
      ok: false,
      error: 'RPC_NOT_DEPLOYED',
    });
    return NextResponse.json(
      {
        error: 'RPC_NOT_DEPLOYED',
        detail: 'Aplicar migraciones 154 + 166 (wrappers public → internal, service_role)',
      },
      { status: 503 }
    );
  }

  if (error) {
    await recordCronHeartbeat(supabase, 'cron_attendance_close_open', {
      ok: false,
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordCronHeartbeat(supabase, 'cron_attendance_close_open', {
    ok: true,
    metadata: { data: data ?? null, graceMin },
  });

  return NextResponse.json({ success: true, data: data ?? null });
}

/** Vercel Cron invoca GET. */
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
