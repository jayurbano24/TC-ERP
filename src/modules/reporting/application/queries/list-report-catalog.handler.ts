import type { IReportCatalogRepository } from '../../domain/ports/report-run.repository.port';

export class ListReportCatalogHandler {
  constructor(private readonly catalogRepo: IReportCatalogRepository) {}

  async execute() {
    const reports = await this.catalogRepo.listActive();
    return { success: true as const, reports };
  }
}
