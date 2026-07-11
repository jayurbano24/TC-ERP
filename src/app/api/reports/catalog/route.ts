import { ReportingController } from '@/modules/reporting/interfaces/ReportingController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const controller = new ReportingController();

export const GET = withErrorHandler(async (req: Request) => {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  return withResolvedReadClient(auth, () => controller.listCatalog());
}, {
  module: 'reporting',
  action: 'catalog.list',
});
