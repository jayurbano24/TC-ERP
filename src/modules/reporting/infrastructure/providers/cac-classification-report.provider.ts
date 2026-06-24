import { queryCacTrayAllFiltered } from '@/lib/database/cacTrayUnits';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  formatSeriesSapStatusLabel,
  formatUnitSapValidationForExport,
  trayRowsToHistoryEntries,
} from '@/lib/backoffice/trayRowAdapter';
import { resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';

async function loadCatalogMaps() {
  const supabase = getSupabaseServerClient();
  const [{ data: techs }, { data: brands }, { data: models }] = await Promise.all([
    supabase.from('technologies').select('id, name'),
    supabase.from('brands').select('id, name'),
    supabase.from('models').select('id, name, technology_id'),
  ]);

  const techMap = new Map((techs || []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const brandMap = new Map((brands || []).map((b: { id: string; name: string }) => [b.id, b.name]));
  const modelMap = new Map(
    (models || []).map((m: { id: string; name: string; technology_id: string | null }) => [m.id, m])
  );

  return { techMap, brandMap, modelMap };
}

function formatAgency(raw: string, carrier?: string | null): string {
  if (raw) return raw;
  return carrier || '---';
}

export class CacClassificationReportProvider implements IReportDataProvider {
  readonly code = 'CAC_CLASIFICACION_HISTORICO';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const rows = await queryCacTrayAllFiltered({
      from: filters.from,
      to: filters.to,
      search: filters.search,
      guide: filters.guide,
      pilot: filters.pilot,
      courier: filters.courier,
      receivedBy: filters.receivedBy,
      status: filters.status,
      osLabel: filters.osLabel,
      sapDocument: filters.sapDocument,
      techId: filters.techId,
      brandId: filters.brandId,
      modelId: filters.modelId,
      agencyId: filters.agencyId,
    });

    const entries = trayRowsToHistoryEntries(rows);
    const { techMap, brandMap, modelMap } = await loadCatalogMaps();

    const reportRows: ReportRow[] = entries.map((entry) => {
      const dateObj = new Date(entry.classifiedAtIso);
      const formattedDate = `${dateObj.getDate()}-${dateObj.getMonth() + 1}-${dateObj.getFullYear()} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
      const piloto = entry.rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
      const modelObj = modelMap.get(entry.grp.modelId);
      const reentry =
        entry.unit.find((u) => u?.service_orders?.reentry_count)?.service_orders?.reentry_count || 1;
      const seriesSapStatuses = entry.seriesSapStatuses ?? entry.unit.map((u) => u.sap_status || 'Pendiente');
      const unitSapValidationStatus =
        entry.unitSapValidationStatus ??
        resolveUnitSapStatus(entry.unit[0]?.service_orders?.sap_integration_status, seriesSapStatuses);

      return {
        'Fecha / Hora': formattedDate,
        'No. Guía': entry.unitGuide,
        Piloto: piloto,
        Courier: entry.rec.carrier || '---',
        Recibió: entry.rec.notes?.split('Por: ')[1]?.split('\n')[0] || '---',
        Estatus: entry.unitStatusLabel,
        'Orden de Servicio': entry.osLabel,
        Ingreso: `${reentry}° Ingreso`,
        'Agencia CAC': formatAgency(entry.unitAgencyRaw, entry.rec.carrier),
        Tecnología: modelObj ? techMap.get(modelObj.technology_id || '') || '---' : '---',
        Marca: brandMap.get(entry.grp.brandId) || '---',
        Modelo: modelObj?.name || '---',
        'Documento SAP': entry.unitSap,
        'Validación SAP': formatUnitSapValidationForExport(unitSapValidationStatus),
        'S-1': entry.unit[0]?.serial_number || '---',
        'S-2': entry.unit[1]?.serial_number || '---',
        'S-3': entry.unit[2]?.serial_number || '---',
        'S-4': entry.unit[3]?.serial_number || '---',
      };
    });

    return { rows: reportRows, truncated: rows.length >= 10000 };
  }
}
