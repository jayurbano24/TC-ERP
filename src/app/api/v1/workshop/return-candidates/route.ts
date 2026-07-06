import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { findReturnCandidatesWithoutDiagnosis } from '@/modules/workshop/server/workshopReturnService';
import { getWorkshopReadClient } from '@/shared/infrastructure/workshop/workshopReadClient';

const Query = z.object({
  source: z.enum(['in_qc', 'in_validation', 'in_refurbish', 'in_control_warehouse']).default('in_qc'),
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

    const result = await findReturnCandidatesWithoutDiagnosis(
      getWorkshopReadClient(),
      parsed.data.source
    );

    return NextResponse.json({
      seriesIds: result.seriesIds,
      equipmentCount: result.equipmentCount,
      seriesCount: result.seriesIds.length,
    });
  },
  { module: 'taller', action: 'return_candidates', roles: ROLES_TALLER }
);
