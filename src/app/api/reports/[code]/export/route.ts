import { ReportingController } from '@/modules/reporting/interfaces/ReportingController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

const controller = new ReportingController();

export const POST = withErrorHandler(
  async (request: Request, context: { params: Promise<{ code: string }> }) => {
    const { code } = await context.params;
    return controller.exportReport(code, request);
  },
  { module: 'reporting', action: 'report.export' }
);
