import { NextResponse } from 'next/server';
import { generateReportHex, listReportCatalogHex, parseExportFormat, parseReportFilters } from '../factory';
import { isCentralReportingEnabledServer } from '../infrastructure/feature-flags';

export class ReportingController {
  async listCatalog(): Promise<NextResponse> {
    if (!isCentralReportingEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'USE_CENTRAL_REPORTING no está activo' },
        { status: 403 }
      );
    }

    const result = await listReportCatalogHex();
    return NextResponse.json(result);
  }

  async exportReport(code: string, request: Request): Promise<NextResponse> {
    if (!isCentralReportingEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'USE_CENTRAL_REPORTING no está activo' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = await generateReportHex({
      reportCode: code,
      format: parseExportFormat(body.format),
      filters: parseReportFilters(body.filters || body),
      userId: typeof body.userId === 'string' ? body.userId : null,
      userName: typeof body.userName === 'string' ? body.userName : null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Report-Row-Count': String(result.rowCount),
      },
    });
  }
}
