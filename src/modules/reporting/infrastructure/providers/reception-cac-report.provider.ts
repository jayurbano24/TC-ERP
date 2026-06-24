import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';

export class ReceptionCacReportProvider implements IReportDataProvider {
  readonly code = 'RECEPCION_HISTORICO_CAC';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const supabase = getSupabaseServerClient();
    let query = supabase
      .from('receptions')
      .select('id, guide_number, carrier, notes, status, created_at')
      .eq('source', 'cac')
      .order('created_at', { ascending: false })
      .limit(10000);

    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`);
    if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`);
    if (filters.guide?.trim()) query = query.ilike('guide_number', `%${filters.guide.trim()}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows: ReportRow[] = (data || []).map((r) => {
      const pilot = r.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
      const receivedBy = r.notes?.match(/Recibió:\s*(.+)/i)?.[1]?.split('\n')[0]?.trim() || '---';
      return {
        Fecha: new Date(r.created_at).toLocaleString('es-GT'),
        'No. Guía': r.guide_number || '---',
        Piloto: pilot,
        Courier: r.carrier || '---',
        Recibió: receivedBy,
        Estatus: r.status || '---',
        Unidades: '—',
      };
    });

    return { rows, truncated: rows.length >= 10000 };
  }
}
