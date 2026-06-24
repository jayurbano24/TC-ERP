import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import { AccessoryDirectDispatchReportProvider } from './accessory-direct-dispatch-report.provider';
import { AccessoryInventoryReportProvider } from './accessory-inventory-report.provider';
import { CacClassificationReportProvider } from './cac-classification-report.provider';
import { DispatchBatchReportProvider } from './dispatch-batch-report.provider';
import { ReceptionCacReportProvider } from './reception-cac-report.provider';

const providers: IReportDataProvider[] = [
  new CacClassificationReportProvider(),
  new ReceptionCacReportProvider(),
  new AccessoryInventoryReportProvider(),
  new DispatchBatchReportProvider(),
  new AccessoryDirectDispatchReportProvider(),
];

const byCode = new Map(providers.map((p) => [p.code, p]));

export function getReportDataProvider(code: string): IReportDataProvider | undefined {
  return byCode.get(code);
}

export function listReportDataProviders(): IReportDataProvider[] {
  return [...providers];
}
