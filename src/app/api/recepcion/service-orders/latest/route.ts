import { NextResponse } from 'next/server';
import { getLatestServiceOrderForSeries } from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const seriesId = searchParams.get('seriesId')?.trim();
  const mainSerial = searchParams.get('mainSerial')?.trim() || undefined;

  if (!seriesId) {
    return NextResponse.json({ success: false, error: 'seriesId requerido' }, { status: 400 });
  }

  const data = await getLatestServiceOrderForSeries(seriesId, mainSerial);
  return NextResponse.json({ success: true, data });
}, { module: 'recepcion-service-orders', action: 'latest', roles: ROLES_RECEPCION });
