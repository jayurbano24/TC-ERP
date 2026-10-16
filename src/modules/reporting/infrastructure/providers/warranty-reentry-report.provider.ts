import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';
import { addWarrantyDays, WARRANTY_PERIOD_DAYS } from '@/modules/warranty/domain/warrantyPolicy';

const OS_SELECT =
  'id, os_label, main_serial, reentry_count, created_at, ingress_kind, warranty_profile, warranty_basis_dispatch_at, warranty_basis_os_id, model_id, brand_id, reception_id';

export class WarrantyReentryReportProvider implements IReportDataProvider {
  readonly code = 'REINGRESO_GARANTIA';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const supabase = getSupabaseServerClient();
    let query = supabase
      .from('service_orders')
      .select(OS_SELECT)
      .eq('ingress_kind', 'garantia')
      .order('created_at', { ascending: false });

    if (!filters.allData) {
      if (filters.from) query = query.gte('created_at', filters.from);
      if (filters.to) query = query.lte('created_at', filters.to);
    }

    const { data: orders, error } = await query.limit(filters.allData ? 50_000 : 20_000);
    if (error) throw new Error(error.message);

    const osRows = orders ?? [];
    const modelIds = [...new Set(osRows.map((o) => o.model_id).filter(Boolean))] as string[];
    const brandIds = [...new Set(osRows.map((o) => o.brand_id).filter(Boolean))] as string[];
    const priorOsIds = [
      ...new Set(osRows.map((o) => o.warranty_basis_os_id).filter(Boolean)),
    ] as string[];

    const [{ data: models }, { data: brands }, { data: priorOs }] = await Promise.all([
      modelIds.length ? supabase.from('models').select('id, name').in('id', modelIds) : Promise.resolve({ data: [] }),
      brandIds.length ? supabase.from('brands').select('id, name').in('id', brandIds) : Promise.resolve({ data: [] }),
      priorOsIds.length
        ? supabase.from('service_orders').select('id, os_label').in('id', priorOsIds)
        : Promise.resolve({ data: [] }),
    ]);

    const modelMap = new Map((models ?? []).map((m) => [m.id, m.name]));
    const brandMap = new Map((brands ?? []).map((b) => [b.id, b.name]));
    const priorMap = new Map((priorOs ?? []).map((o) => [o.id, o.os_label]));

    const rows: ReportRow[] = osRows.map((os) => {
      const ingressAt = new Date(os.created_at);
      const dispatchAt = os.warranty_basis_dispatch_at ? new Date(os.warranty_basis_dispatch_at) : null;
      const warrantyEnd =
        dispatchAt && !Number.isNaN(dispatchAt.getTime())
          ? addWarrantyDays(dispatchAt, WARRANTY_PERIOD_DAYS)
          : null;
      const daysSinceDispatch =
        dispatchAt && !Number.isNaN(dispatchAt.getTime())
          ? Math.floor((ingressAt.getTime() - dispatchAt.getTime()) / (24 * 60 * 60 * 1000))
          : null;

      return {
        'Fecha ingreso': ingressAt.toLocaleString('es-GT'),
        'Orden de Servicio': os.os_label || '—',
        'N° Ingreso': `${os.reentry_count ?? 1}°`,
        Serie: os.main_serial || '—',
        Marca: brandMap.get(os.brand_id ?? '') || '—',
        Modelo: modelMap.get(os.model_id ?? '') || '—',
        'Tipo ingreso': 'Garantía',
        'Perfil despacho': os.warranty_profile === 'bueno' ? 'Bueno (B)' : os.warranty_profile === 'listo' ? 'Equipo Listo' : '—',
        'OS despacho anterior': priorMap.get(os.warranty_basis_os_id ?? '') || os.warranty_basis_os_id || '—',
        'Fecha despacho anterior': dispatchAt ? dispatchAt.toLocaleString('es-GT') : '—',
        'Días desde despacho': daysSinceDispatch ?? '—',
        'Vencimiento garantía': warrantyEnd ? warrantyEnd.toLocaleDateString('es-GT') : '—',
      };
    });

    return { rows };
  }
}
