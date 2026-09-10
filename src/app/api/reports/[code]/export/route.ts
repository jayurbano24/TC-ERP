import { ReportingController } from '@/modules/reporting/interfaces/ReportingController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { ROLES_PRODUCCION } from '@/shared/authz/roleGuard';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
/** CENAM ETL puede tardar ~1–3 min la primera vez por mes; re-export usa snapshot. */
export const maxDuration = 300;

const controller = new ReportingController();

export const POST = withErrorHandler(
  async (request: Request, context: { params: Promise<{ code: string }> }) => {
    const auth = await requireApiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { code } = await context.params;
    return withResolvedReadClient(auth, () => controller.exportReport(code, request));
  },
  { module: 'reporting', action: 'report.export', roles: ROLES_PRODUCCION }
);
