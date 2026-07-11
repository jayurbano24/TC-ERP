import { NextRequest, NextResponse } from 'next/server';
import { queryTransferEligibleSeries } from '@/modules/recepcion/server/cacTrayQueries';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { logOnlyRoleCheck, ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const denied = await logOnlyRoleCheck(req, ROLES_RECEPCION, {
      module: 'backoffice',
      action: 'cac-history.transfer-eligible',
    });
    if (denied) return denied;

    const sp = req.nextUrl.searchParams;
    const techId = sp.get('techId');
    const brandId = sp.get('brandId');
    const modelId = sp.get('modelId');

    if (!techId || !brandId || !modelId) {
      return NextResponse.json({ error: 'techId, brandId y modelId son requeridos' }, { status: 400 });
    }

    const { client } = resolveReadClient(auth.supabase);
    const items = await queryTransferEligibleSeries(techId, brandId, modelId, client);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar equipos elegibles';
    console.error('cac-history/transfer-eligible:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
