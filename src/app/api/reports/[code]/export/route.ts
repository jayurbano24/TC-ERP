import { ReportingController } from '@/modules/reporting/interfaces/ReportingController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { ROLES_PRODUCCION } from '@/shared/authz/roleGuard';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
/** CENAM ETL ~1–3 min; pre-diagnóstico «todos» (~80k filas) puede tardar 10–20 min. */
export const maxDuration = 900;

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
