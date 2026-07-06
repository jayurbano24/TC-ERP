import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { locateWorkshopEquipment } from '@/modules/workshop/server/workshopTasksService';
import { getWorkshopReadClient } from '@/shared/infrastructure/workshop/workshopReadClient';

const LocateQuery = z.object({
  q: z.string().min(2).max(120),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = LocateQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const location = await locateWorkshopEquipment(getWorkshopReadClient(), parsed.data.q);
    return NextResponse.json(location);
  },
  { module: 'taller', action: 'locate_equipment', roles: ROLES_TALLER }
);
