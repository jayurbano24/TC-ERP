import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { assertUuidArray } from '@/shared/infrastructure/http/batchLimit';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { warehouseBoxIdempotencyKey } from '@/lib/database/warehouse';

const TransferBody = z.object({
  boxIds: z
    .array(z.string().uuid())
    .min(1)
    .max(BATCH_LIMITS.WORKSHOP_TRANSFER_BOXES),
  targetModule: z.literal('taller').default('taller'),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/warehouse/transfer-to-workshop';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    const parsed = TransferBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { boxIds, targetModule } = parsed.data;
    assertUuidArray(boxIds, 'boxIds');

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', user.id)
      .maybeSingle();

    const operatorId = profile?.id ?? user.id;
    const operatorName = profile?.full_name ?? user.email ?? 'Operador';

    const results: Array<{
      boxId: string;
      ok: boolean;
      seriesCount?: number;
      error?: string;
    }> = [];

    for (const boxId of boxIds) {
      const idempotencyKey = warehouseBoxIdempotencyKey(boxId, 'dispersion', 'taller');

      const { data, error } = await supabase.rpc('warehouse_dispersion_tx', {
        p_box_id: boxId,
        p_target_module: targetModule,
        p_operator_id: operatorId,
        p_operator_name: operatorName,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        const msg = String(error.message ?? error);
        if (msg.includes('ALREADY_DISPERSED')) {
          results.push({ boxId, ok: true, seriesCount: 0 });
          continue;
        }
        results.push({ boxId, ok: false, error: msg });
        continue;
      }

      const payload = data as { series_count?: number } | null;
      results.push({ boxId, ok: true, seriesCount: payload?.series_count ?? 0 });
    }

    const succeeded = results.filter((r) => r.ok).length;
    const responseBody =
      succeeded === 0
        ? { error: 'ALL_FAILED', results }
        : { success: true, transferred: succeeded, total: boxIds.length, results };

    const status = succeeded === 0 ? 422 : 200;
    logEgress({
      route,
      module: 'bodega',
      action: 'transfer_to_workshop',
      correlationId,
      rowCount: boxIds.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status,
    });

    return NextResponse.json(responseBody, { status });
  },
  { module: 'bodega', action: 'transfer_to_workshop', roles: ROLES_BODEGA_DESPACHO }
);
