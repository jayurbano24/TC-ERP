import { NextResponse } from 'next/server';
import { lookupSeriesBySerial } from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const serial = new URL(req.url).searchParams.get('serial')?.trim();
  if (!serial) {
    return NextResponse.json({ success: false, error: 'serial requerido' }, { status: 400 });
  }
  const data = await lookupSeriesBySerial(serial);
  return NextResponse.json({ success: true, data });
}, { module: 'recepcion-series', action: 'lookup', roles: ROLES_RECEPCION });
