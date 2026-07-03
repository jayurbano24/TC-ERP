import { COUNT_HEAD } from '@/shared/constants/dbProjections';
import { injectable, inject } from 'tsyringe';
import { IQueryHandler } from '../../../../modules/recepcion/application/cqrs/IQueryHandler';
import { GetProduccionDashboardQuery } from './GetProduccionDashboardQuery';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { SupabaseClient } from '@supabase/supabase-js';

@injectable()
export class GetProduccionDashboardHandler implements IQueryHandler<GetProduccionDashboardQuery, any> {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async execute(query: GetProduccionDashboardQuery, ctx: RequestContext): Promise<any> {
    const tenantId = ctx.tenantId;

    const [{ count: diagPendientes }, { count: diagProceso }, { count: repEspera }, { count: repActivas }] = await Promise.all([
      this.supabase.from('prod_diagnostico').select(COUNT_HEAD, { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estado', 'PENDIENTE').eq('is_deleted', false),
      this.supabase.from('prod_diagnostico').select(COUNT_HEAD, { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estado', 'EN_PROCESO').eq('is_deleted', false),
      this.supabase.from('prod_reparacion').select(COUNT_HEAD, { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estado', 'ESPERA_REPUESTOS').eq('is_deleted', false),
      this.supabase.from('prod_reparacion').select(COUNT_HEAD, { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estado', 'REPARANDO').eq('is_deleted', false),
    ]);

    const { data: ultimosDiagnosticos } = await this.supabase
      .from('prod_diagnostico')
      .select('id, orden_logistica_id, tecnico_id, updated_at')
      .eq('tenant_id', tenantId)
      .eq('estado', 'COMPLETADO')
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(10);

    return {
      kpis: {
        diagnosticosPendientes: diagPendientes || 0,
        diagnosticosEnProceso: diagProceso || 0,
        reparacionesEnEspera: repEspera || 0,
        reparacionesActivas: repActivas || 0
      },
      ultimosDiagnosticos: ultimosDiagnosticos || []
    };
  }
}
