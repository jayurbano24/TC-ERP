import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { assertUuidArray } from '@/shared/infrastructure/http/batchLimit';
import { addWorkshopSeriesComment } from '@/modules/workshop/server/workshopCommentService';
import { resolveSessionActor } from '@/shared/infrastructure/session/resolveSessionActor';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const BodySchema = z.object({
  series_ids: z.array(z.string().uuid()).min(1),
  comment: z.string().trim().min(1).max(2000),
  tab: z.string().max(40).optional(),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/comments';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { series_ids, comment, tab } = parsed.data;
    if (series_ids.length > BATCH_LIMITS.WORKSHOP_OPERATE_SERIES_BATCH) {
      return NextResponse.json(
        {
          error: 'BATCH_TOO_LARGE',
          detail: `Máximo ${BATCH_LIMITS.WORKSHOP_OPERATE_SERIES_BATCH} series por lote`,
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

    const { processed } = await addWorkshopSeriesComment(supabase, {
      seriesIds: series_ids,
      comment,
      userId: user.id,
      userRole: roleData?.role,
      operatorName: actor.fullName,
      tab,
    });

    const responseBody = { success: true, processed };
    logEgress({
      route,
      module: 'taller',
      action: 'add_comment',
      correlationId,
      rowCount: processed,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'taller', action: 'add_comment', roles: ROLES_TALLER }
);
