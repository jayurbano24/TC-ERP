import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';

export class DispatchBatchReportProvider implements IReportDataProvider {
  readonly code = 'DESPACHO_POR_LOTE_SALIDA';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const supabase = getSupabaseServerClient();
    let batchQuery = supabase
      .from('dispatch_batches')
      .select('id, batch_number, status, destination, created_at, closed_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (filters.from) batchQuery = batchQuery.gte('created_at', `${filters.from}T00:00:00`);
    if (filters.to) batchQuery = batchQuery.lte('created_at', `${filters.to}T23:59:59`);
    if (filters.batchNumber?.trim()) {
      batchQuery = batchQuery.ilike('batch_number', `%${filters.batchNumber.trim()}%`);
    }
    if (filters.batchId?.trim()) batchQuery = batchQuery.eq('id', filters.batchId.trim());

    const { data: batches, error } = await batchQuery;
    if (error) throw new Error(error.message);

    const rows: ReportRow[] = [];

    for (const batch of batches || []) {
      const [{ data: accessoryLines }, { data: dispatches }] = await Promise.all([
        supabase
          .from('accessory_movements')
          .select('quantity, destination, condition, created_at, accessories(name)')
          .eq('dispatch_batch_id', batch.id)
          .eq('movement_type', 'OUT'),
        supabase
          .from('dispatches')
          .select('id, guide_number, notes, created_at')
          .eq('dispatch_batch_id', batch.id),
      ]);

      for (const line of accessoryLines || []) {
        const acc = line.accessories as { name?: string } | null;
        rows.push({
          Lote: batch.batch_number,
          'Estado Lote': batch.status,
          Tipo: 'Accesorio',
          Referencia: acc?.name || '---',
          Detalle: line.condition || '---',
          Cantidad: line.quantity ?? 0,
          Destino: line.destination || batch.destination || '---',
          Fecha: new Date(line.created_at).toLocaleString('es-GT'),
        });
      }

      for (const d of dispatches || []) {
        rows.push({
          Lote: batch.batch_number,
          'Estado Lote': batch.status,
          Tipo: 'Despacho equipo',
          Referencia: d.guide_number || d.id,
          Detalle: d.notes || '---',
          Cantidad: 1,
          Destino: batch.destination || '---',
          Fecha: new Date(d.created_at).toLocaleString('es-GT'),
        });
      }

      if ((accessoryLines?.length || 0) === 0 && (dispatches?.length || 0) === 0) {
        rows.push({
          Lote: batch.batch_number,
          'Estado Lote': batch.status,
          Tipo: '—',
          Referencia: 'Sin movimientos',
          Detalle: '—',
          Cantidad: 0,
          Destino: batch.destination || '---',
          Fecha: new Date(batch.created_at).toLocaleString('es-GT'),
        });
      }
    }

    return { rows };
  }
}
