import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import {
  ROLES_PREDIAG_BACKFILL,
  ROLES_RECEPCION,
  userHasAnyOperationalRole,
} from '@/shared/authz/roleGuard';
import { tryResolvePrediagnosticoBackfillCutoff } from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillConfig';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const allowed = await userHasAnyOperationalRole(auth.user.id, ROLES_RECEPCION);
    if (!allowed) {
      return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });
    }

    const [canRunBackfill, cutoff] = await Promise.all([
      userHasAnyOperationalRole(auth.user.id, ROLES_PREDIAG_BACKFILL),
      Promise.resolve(tryResolvePrediagnosticoBackfillCutoff()),
    ]);
    return NextResponse.json({
      cutoff: cutoff?.toISOString() ?? null,
      configured: cutoff !== null,
      canRunBackfill,
    });
  },
  { module: 'backoffice', action: 'prediagnostico.backfill.context', roles: ['admin', 'supervisor'] }
);
