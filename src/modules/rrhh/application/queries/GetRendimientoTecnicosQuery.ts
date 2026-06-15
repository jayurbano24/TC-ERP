import { SupabaseClient } from '@supabase/supabase-js';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { injectable, inject } from 'tsyringe';

@injectable()
export class GetRendimientoTecnicosQuery {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async execute(ctx: RequestContext, mes: number, anio: number) {
    const { data: rendimientos } = await this.supabase
      .from('rrhh_desempeno')
      .select(`
        *,
        empleado:empleado_id (
          nombre,
          apellido,
          departamento,
          cargo
        )
      `)
      .eq('tenant_id', ctx.tenantId)
      .eq('mes', mes)
      .eq('anio', anio);

    if (!rendimientos) return [];

    return rendimientos.map((r: any) => ({
      empleadoId: r.empleado_id,
      nombre: `${r.empleado?.nombre} ${r.empleado?.apellido}`,
      departamento: r.empleado?.departamento,
      cargo: r.empleado?.cargo,
      equiposDiagnosticados: r.equipos_diagnosticados,
      reparacionesExitosas: r.reparaciones_exitosas,
      reparacionesFallidas: r.reparaciones_fallidas,
      tasaExito: r.reparaciones_exitosas + r.reparaciones_fallidas > 0 
        ? (r.reparaciones_exitosas / (r.reparaciones_exitosas + r.reparaciones_fallidas)) * 100 
        : 0
    }));
  }
}
