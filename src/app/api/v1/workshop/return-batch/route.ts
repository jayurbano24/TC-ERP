import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { assertUuidArray } from '@/shared/infrastructure/http/batchLimit';
import { returnWorkshopSeriesBatch } from '@/modules/workshop/server/workshopReturnService';
import { resolveSessionActor } from '@/shared/infrastructure/session/resolveSessionActor';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const ReturnBody = z.object({
  series_ids: z.array(z.string().uuid()).min(1),
  target_status: z.enum(['in_workshop', 'in_qc', 'in_validation', 'in_refurbish', 'in_control_warehouse', 'irreparable']).default('in_workshop'),
  reason: z.string().max(500).optional(),
});

const STATUS_LABELS: Record<string, string> = {
  in_workshop: 'TRASLADO A DIAGNÓSTICO',
  in_qc: 'TRASLADO A REPARACIÓN',
  in_validation: 'TRASLADO A CONTROL DE CALIDAD',
  in_refurbish: 'TRASLADO A REACONDICIONADO',
  in_control_warehouse: 'TRASLADO A L3',
  irreparable: 'TRASLADO A SCRAPS',
};

export const POST = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/return-batch';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = ReturnBody.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { series_ids, target_status, reason } = parsed.data;

    if (series_ids.length > BATCH_LIMITS.WORKSHOP_OPERATE_SERIES_BATCH) {
      return NextResponse.json(
        {
          error: 'BATCH_TOO_LARGE',
          detail: `Máximo ${BATCH_LIMITS.WORKSHOP_OPERATE_SERIES_BATCH} series por lote; recibidos ${series_ids.length}`,
          max: BATCH_LIMITS.WORKSHOP_OPERATE_SERIES_BATCH,
        },
        { status: 400 }
      );
    }

    assertUuidArray(series_ids, 'series_ids');

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const actor = await resolveSessionActor(user);

    const { processed } = await returnWorkshopSeriesBatch(supabase, {
      seriesIds: series_ids,
      targetStatus: target_status,
      userId: user.id,
      userRole: roleData?.role,
      operatorName: actor.fullName,
      reason,
      actionLabel: STATUS_LABELS[target_status] ?? 'TRASLADO DE ETAPA',
    });

    const responseBody = { success: true, processed };

    logEgress({
      route,
      module: 'taller',
      action: 'return_batch',
      correlationId,
      rowCount: processed,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'taller', action: 'return_batch', roles: ROLES_TALLER }
);
