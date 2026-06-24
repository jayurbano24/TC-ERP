import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';

export class AccessoryDirectDispatchReportProvider implements IReportDataProvider {
  readonly code = 'DESPACHO_ACCESORIOS_SIN_LOTE';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const supabase = getSupabaseServerClient();
    let query = supabase
      .from('accessory_movements')
      .select(
        'quantity, destination, condition, created_at, created_by, dispatch_mode, dispatch_batch_id, accessories(name)'
      )
      .eq('movement_type', 'OUT')
      // Sin lote: explícito WITHOUT_BATCH o legacy (columnas nuevas NULL + sin batch)
      .or('dispatch_mode.eq.WITHOUT_BATCH,and(dispatch_mode.is.null,dispatch_batch_id.is.null)')
      .order('created_at', { ascending: false })
      .limit(10000);

    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00-06:00`);
    if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59.999-06:00`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows: ReportRow[] = (data || []).map((m) => {
      const acc = m.accessories as { name?: string } | null;
      return {
        Fecha: new Date(m.created_at).toLocaleString('es-GT'),
        Accesorio: acc?.name || '---',
        Condición: m.condition === 'NEW' ? 'Nuevo' : 'Recuperado',
        Cantidad: m.quantity ?? 0,
        Destino: m.destination || '---',
        Usuario: m.created_by ? String(m.created_by).slice(0, 8) : '---',
      };
    });

    return { rows, truncated: rows.length >= 10000 };
  }
}
