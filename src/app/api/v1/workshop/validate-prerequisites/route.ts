import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import {
  loadWorkshopCompletionBySeries,
  validateEquipmentPrerequisites,
} from '@/modules/workshop/server/workshopStagePrerequisites';
import { expandSeriesIdsToEquipmentSiblings } from '@/modules/workshop/server/workshopOperateService';
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

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

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
    const requestedIds = [...new Set(parsed.data.series_ids)];
    const seriesIds = await expandSeriesIdsToEquipmentSiblings(db, requestedIds);

    const seriesToOs = new Map<string, string | null>();
    const seriesStatus = new Map<string, string>();
    for (const chunk of chunkIds(seriesIds)) {
      const { data, error } = await db
        .from('series')
        .select('id, service_order_id, current_status')
        .in('id', chunk);
      if (error) throw error;
      for (const row of data || []) {
        const id = String(row.id);
        seriesToOs.set(id, row.service_order_id ? String(row.service_order_id) : null);
        seriesStatus.set(id, String(row.current_status || ''));
      }
    }

    const completedBySeries = await loadWorkshopCompletionBySeries(db, seriesIds);

    const result = validateEquipmentPrerequisites(
      seriesIds,
      seriesToOs,
      completedBySeries,
      parsed.data.action_name,
      seriesStatus,
    );

    return NextResponse.json(result);
  },
  { module: 'taller', action: 'validate_prerequisites', roles: ROLES_TALLER }
);
