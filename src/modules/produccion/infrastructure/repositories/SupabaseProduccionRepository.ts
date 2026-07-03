import {
  PROD_DIAGNOSTICO_SELECT,
  PROD_REPARACION_SELECT,
} from '@/shared/constants/dbProjections';
import { SupabaseClient } from '@supabase/supabase-js';
import { injectable, inject } from 'tsyringe';
import { IProduccionRepository } from '../../domain/repositories/IProduccionRepository';
import { DiagnosticoAggregate } from '../../domain/aggregates/DiagnosticoAggregate';
import { ReparacionAggregate } from '../../domain/aggregates/ReparacionAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';

@injectable()
export class SupabaseProduccionRepository implements IProduccionRepository {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async saveDiagnostico(ctx: RequestContext, diagnostico: DiagnosticoAggregate): Promise<void> {
    const { error } = await this.supabase
      .from('prod_diagnostico')
      .upsert({
        id: diagnostico.id,
        orden_logistica_id: diagnostico.props.ordenLogisticaId,
        estado: diagnostico.props.estado,
        tecnico_id: diagnostico.props.tecnicoId,
        observaciones: diagnostico.props.observaciones,
        tenant_id: ctx.tenantId,
        branch_id: ctx.branchId,
      }, { onConflict: 'id' });

    if (error) throw new Error(`[DiagnosticoRepo] ${error.message}`);
  }

  async getDiagnosticoById(ctx: RequestContext, id: string): Promise<DiagnosticoAggregate | null> {
    const { data, error } = await this.supabase
      .from('prod_diagnostico')
      .select(PROD_DIAGNOSTICO_SELECT)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (error || !data) return null;

    return DiagnosticoAggregate.create(data.id, data.tenant_id, data.branch_id, {
      ordenLogisticaId: data.orden_logistica_id,
      tecnicoId: data.tecnico_id || undefined,
      estado: data.estado,
      observaciones: data.observaciones || undefined,
    });
  }

  async saveReparacion(ctx: RequestContext, reparacion: ReparacionAggregate): Promise<void> {
    const { error } = await this.supabase
      .from('prod_reparacion')
      .upsert({
        id: reparacion.id,
        diagnostico_id: reparacion.props.diagnosticoId,
        estado: reparacion.props.estado,
        tecnico_id: reparacion.props.tecnicoId,
        repuestos_usados: reparacion.props.repuestosUsados,
        tiempo_invertido: reparacion.props.tiempoInvertido,
        tenant_id: ctx.tenantId,
        branch_id: ctx.branchId,
      }, { onConflict: 'id' });

    if (error) throw new Error(`[ReparacionRepo] ${error.message}`);
  }

  async getReparacionById(ctx: RequestContext, id: string): Promise<ReparacionAggregate | null> {
    const { data, error } = await this.supabase
      .from('prod_reparacion')
      .select(PROD_REPARACION_SELECT)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (error || !data) return null;

    return ReparacionAggregate.create(data.id, data.tenant_id, data.branch_id, {
      diagnosticoId: data.diagnostico_id,
      tecnicoId: data.tecnico_id || undefined,
      estado: data.estado,
      repuestosUsados: data.repuestos_usados || undefined,
      tiempoInvertido: data.tiempo_invertido || undefined,
    });
  }
}
