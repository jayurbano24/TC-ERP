/**
 * Cron: expulsa usuarios ERP sin actividad > 45 min.
 * Protegido por CRON_SECRET. Vercel Cron invoca GET.
 */
import { NextResponse } from 'next/server';
import { recordCronHeartbeat } from '@/lib/cron/recordCronHeartbeat';
import { cleanupIdleSessions } from '@/lib/session/cleanupIdleSessions';
import { SESSION_IDLE_MINUTES } from '@/lib/session/idlePolicy';
import { getSupabaseServerClient } from '@/lib/supabase/server';

async function handle(req: Request) {
  const secret =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

  try {
    const result = await cleanupIdleSessions(supabase, {
      idleMinutes: SESSION_IDLE_MINUTES,
    });

    await recordCronHeartbeat(supabase, 'cron_session_idle_cleanup', {
      ok: true,
      metadata: result,
      rowsAffected: result.deletedSessions,
      rowsRead: result.userIds.length,
    });

    return NextResponse.json({
      success: true,
      idleMinutes: SESSION_IDLE_MINUTES,
      ...result,
      refreshed_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Idle cleanup failed';
    await recordCronHeartbeat(supabase, 'cron_session_idle_cleanup', {
      ok: false,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
