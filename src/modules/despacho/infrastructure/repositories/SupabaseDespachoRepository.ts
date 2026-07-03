import { SupabaseClient } from '@supabase/supabase-js';
import { injectable, inject } from 'tsyringe';
import { IDespachoRepository } from '../../domain/repositories/IDespachoRepository';
import { DespachoAggregate } from '../../domain/aggregates/DespachoAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';

const DESPACHO_ORDEN_SELECT =
  'id, tenant_id, branch_id, reparacion_id, cliente_nombre, equipo_info, estado, direccion, tracking_code, fecha_entrega, is_deleted';

@injectable()
export class SupabaseDespachoRepository implements IDespachoRepository {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async save(ctx: RequestContext, despacho: DespachoAggregate): Promise<void> {
    const props = (despacho as any).props;

    const { error: despachoError } = await this.supabase
      .from('despacho_orden')
      .upsert({
        id: despacho.id,
        tenant_id: despacho.tenantId,
        branch_id: despacho.branchId,
        reparacion_id: props.reparacionId,
        cliente_nombre: props.clienteNombre,
        equipo_info: props.equipoInfo,
        estado: props.estado,
        direccion: props.direccion,
        tracking_code: props.trackingCode,
        fecha_entrega: props.fechaEntrega,
      }, { onConflict: 'id' });

    if (despachoError) throw new Error(`[DespachoRepo] ${despachoError.message}`);

    // Insertar eventos en Outbox
    const events = despacho.domainEvents;
    for (const event of events) {
      const { error: outboxError } = await this.supabase
        .from('outbox_event')
        .insert({
          event_name: event.eventName,
          payload: event.payload ? JSON.stringify(event.payload) : '{}',
          status: 'PENDING',
        });
      if (outboxError) throw new Error(`[OutboxRepo] ${outboxError.message}`);
    }

    despacho.clearEvents();
  }

  async getById(ctx: RequestContext, id: string): Promise<DespachoAggregate | null> {
    const { data, error } = await this.supabase
      .from('despacho_orden')
      .select(DESPACHO_ORDEN_SELECT)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (error || !data || data.is_deleted) return null;
    return this.toDomain(data);
  }

  async getByReparacionId(ctx: RequestContext, reparacionId: string): Promise<DespachoAggregate | null> {
    const { data, error } = await this.supabase
      .from('despacho_orden')
      .select(DESPACHO_ORDEN_SELECT)
      .eq('reparacion_id', reparacionId)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (error || !data || data.is_deleted) return null;
    return this.toDomain(data);
  }

  private toDomain(doc: any): DespachoAggregate {
    return DespachoAggregate.create(doc.id, doc.tenant_id, doc.branch_id, {
      reparacionId: doc.reparacion_id,
      clienteNombre: doc.cliente_nombre,
      equipoInfo: doc.equipo_info,
      estado: doc.estado,
      direccion: doc.direccion || undefined,
      trackingCode: doc.tracking_code || undefined,
      fechaEntrega: doc.fecha_entrega || undefined,
    });
  }
}
