import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import {
  loadCompletedWorkshopActionsBySeries,
  validateSeriesPrerequisites,
} from '@/modules/workshop/server/workshopStagePrerequisites';
import { getWorkshopReadClient } from '@/shared/infrastructure/workshop/workshopReadClient';

const Query = z.object({
  series_ids: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid()).min(1).max(BATCH_LIMITS.WORKSHOP_OPERATE_MAX_SERIES)),
  action_name: z.string().min(1).max(120),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = getWorkshopReadClient();
    const seriesIds = [...new Set(parsed.data.series_ids)];
    const completedBySeries = await loadCompletedWorkshopActionsBySeries(db, seriesIds);

    const result = validateSeriesPrerequisites(
      seriesIds,
      completedBySeries,
      parsed.data.action_name
    );

    return NextResponse.json(result);
  },
  { module: 'taller', action: 'validate_prerequisites', roles: ROLES_TALLER }
);
