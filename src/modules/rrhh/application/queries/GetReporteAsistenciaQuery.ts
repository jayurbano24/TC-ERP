import { SupabaseClient } from '@supabase/supabase-js';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { injectable, inject } from 'tsyringe';

@injectable()
export class GetReporteAsistenciaQuery {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async execute(ctx: RequestContext, fechaInicio: Date, fechaFin: Date) {
    const { data: asistencias } = await this.supabase
      .from('rrhh_asistencia')
      .select(`
        *,
        empleado:empleado_id (
          nombre,
          apellido
        )
      `)
      .eq('tenant_id', ctx.tenantId)
      .gte('fecha', fechaInicio.toISOString())
      .lte('fecha', fechaFin.toISOString())
      .order('fecha', { ascending: false });

    if (!asistencias) return [];

    return asistencias.map((a: any) => {
      const entrada = a.entrada ? new Date(a.entrada) : null;
      const salida = a.salida ? new Date(a.salida) : null;
      
      return {
        empleadoId: a.empleado_id,
        nombre: `${a.empleado?.nombre} ${a.empleado?.apellido}`,
        fecha: new Date(a.fecha),
        entrada,
        salida,
        tipo: a.tipo,
        horasTrabajadas: entrada && salida ? (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60) : 0
      };
    });
  }
}
