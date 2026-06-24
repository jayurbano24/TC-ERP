import { ReportingController } from '@/modules/reporting/interfaces/ReportingController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

const controller = new ReportingController();

export const GET = withErrorHandler(async () => controller.listCatalog(), {
  module: 'reporting',
  action: 'catalog.list',
});
