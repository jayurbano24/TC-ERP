import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';

export class AccessoryInventoryReportProvider implements IReportDataProvider {
  readonly code = 'INVENTARIO_ACCESORIOS';

  async fetch(_filters: ReportFilterParams): Promise<ReportDataResult> {
    const supabase = getSupabaseServerClient();
    const { data: accessories, error } = await supabase
      .from('accessories')
      .select('id, sku, name, qty_new, qty_recovered')
      .order('name');

    if (error) throw new Error(error.message);

    const ids = (accessories || []).map((a: { id: string }) => a.id);
    const lastMoveMap = new Map<string, string>();

    if (ids.length > 0) {
      const { data: movements } = await supabase
        .from('accessory_movements')
        .select('accessory_id, created_at')
        .in('accessory_id', ids)
        .order('created_at', { ascending: false });

      for (const m of movements || []) {
        if (!lastMoveMap.has(m.accessory_id)) {
          lastMoveMap.set(m.accessory_id, new Date(m.created_at).toLocaleString('es-GT'));
        }
      }
    }

    const rows: ReportRow[] = (accessories || []).map((a) => ({
      Código: a.sku || '---',
      Nombre: a.name || '---',
      'Qty Nuevo': a.qty_new ?? 0,
      'Qty Recuperado': a.qty_recovered ?? 0,
      'Último movimiento': lastMoveMap.get(a.id) || '—',
    }));

    return { rows };
  }
}
