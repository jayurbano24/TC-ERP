import { SupabaseClient } from '@supabase/supabase-js';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { injectable, inject } from 'tsyringe';

@injectable()
export class GetDespachosPendientesQuery {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async execute(ctx: RequestContext) {
    const { data: despachos } = await this.supabase
      .from('despacho_orden')
      .select('id, reparacion_id, cliente_nombre, equipo_info, estado, created_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('estado', 'PENDIENTE')
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (!despachos) return [];

    return despachos.map((d: any) => ({
      id: d.id,
      reparacionId: d.reparacion_id,
      cliente: d.cliente_nombre,
      equipo: d.equipo_info,
      estado: d.estado,
      tiempoEnEspera: Math.floor((new Date().getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)) // días en espera
    }));
  }
}
