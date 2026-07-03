import { NextResponse } from 'next/server';
import { getCacReceptionGuides } from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const idsParam = new URL(req.url).searchParams.get('receptionIds') || '';
  const receptionIds = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const data = await getCacReceptionGuides(receptionIds);
  return NextResponse.json({ success: true, data });
}, { module: 'recepcion-cac', action: 'guides', roles: ROLES_RECEPCION });
