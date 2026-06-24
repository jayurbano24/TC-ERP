import type { IReportExporter } from '../../domain/ports/report-exporter.port';
import type { IReportCatalogRepository, IReportRunRepository } from '../../domain/ports/report-run.repository.port';
import { getReportDataProvider } from '../../infrastructure/providers/report-provider.registry';
import type { GenerateReportParams, GenerateReportResult } from '../../domain/types/report.types';

export class GenerateReportHandler {
  constructor(
    private readonly catalogRepo: IReportCatalogRepository,
    private readonly runRepo: IReportRunRepository,
    private readonly exporters: IReportExporter[]
  ) {}

  async execute(params: GenerateReportParams): Promise<GenerateReportResult> {
    const definition = await this.catalogRepo.getByCode(params.reportCode);
    if (!definition) {
      return { success: false, error: `Reporte desconocido: ${params.reportCode}` };
    }

    if (definition.requiresDateRange && !params.filters.from && !params.filters.to) {
      return { success: false, error: 'Este reporte requiere un rango de fechas (desde y/o hasta).' };
    }

    const provider = getReportDataProvider(params.reportCode);
    if (!provider) {
      return { success: false, error: `Provider no implementado para ${params.reportCode}` };
    }

    const exporter = this.exporters.find((e) => e.format === params.format);
    if (!exporter) {
      return { success: false, error: `Formato no soportado: ${params.format}` };
    }

    try {
      const data = await provider.fetch(params.filters);
      if (data.rows.length === 0) {
        await this.runRepo.recordRun({
          reportCode: params.reportCode,
          userId: params.userId,
          userName: params.userName,
          filters: params.filters,
          format: params.format,
          status: 'FAILED',
          rowCount: 0,
          errorMessage: 'Sin datos para los filtros seleccionados',
        });
        return {
          success: false,
          error:
            params.reportCode === 'DESPACHO_ACCESORIOS_SIN_LOTE'
              ? 'No hay salidas directas (sin lote) en ese rango. Si despachaste con lote abierto, usa el reporte «Contenido lote de salida».'
              : 'No hay datos que coincidan con los filtros seleccionados.',
        };
      }

      const exported = await exporter.export(data.rows, definition.name);
      const dateSuffix = params.filters.from || params.filters.to
        ? `_${params.filters.from || 'inicio'}_a_${params.filters.to || 'fin'}`
        : '';
      const filename = `${params.reportCode}${dateSuffix}.${exported.extension}`;

      await this.runRepo.recordRun({
        reportCode: params.reportCode,
        userId: params.userId,
        userName: params.userName,
        filters: params.filters,
        format: params.format,
        status: 'COMPLETED',
        rowCount: data.rows.length,
      });

      return {
        success: true,
        buffer: exported.buffer,
        mimeType: exported.mimeType,
        filename,
        rowCount: data.rows.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al generar reporte';
      await this.runRepo.recordRun({
        reportCode: params.reportCode,
        userId: params.userId,
        userName: params.userName,
        filters: params.filters,
        format: params.format,
        status: 'FAILED',
        errorMessage: message,
      });
      return { success: false, error: message };
    }
  }
}
