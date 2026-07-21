/**
 * Cron: drena outbox_event (Fase 3.5 mínimo / observe-only).
 * Protegido por CRON_SECRET. Usa service_role vía getSupabaseServerClient.
 * Sin tsyringe/DI: evita reflect-metadata en el entrypoint serverless.
 */
import { NextResponse } from 'next/server';
import { recordCronHeartbeat } from '@/lib/cron/recordCronHeartbeat';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IEventBus } from '@/shared/events/IEventBus';
import { OutboxPublisherWorker } from '@/workers/OutboxPublisherWorker';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Observe-only: marca COMPLETED sin handlers de dominio. */
const observeOnlyBus: IEventBus = {
  async emit() {
    /* no-op */
  },
};

function assertCronAuth(req: Request): NextResponse | null {
  const secret =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

async function handle(req: Request) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const batchSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get('batchSize') || '100') || 100)
  );
  const maxBatches = Math.min(
    40,
    Math.max(1, Number(url.searchParams.get('maxBatches') || '20') || 20)
  );

  const supabase = getSupabaseServerClient();
  const worker = new OutboxPublisherWorker(supabase, observeOnlyBus, batchSize);

  try {
    const result = await worker.processUntil({
      maxBatches,
      timeBudgetMs: 50_000,
    });

    await recordCronHeartbeat(supabase, 'cron_outbox_publish', {
      ok: true,
      metadata: result,
      rowsRead: result.claimed,
      rowsAffected: result.completed,
    });

    return NextResponse.json({
      success: true,
      ...result,
      refreshed_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Outbox publish failed';
    await recordCronHeartbeat(supabase, 'cron_outbox_publish', {
      ok: false,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Vercel Cron invoca GET. */
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
