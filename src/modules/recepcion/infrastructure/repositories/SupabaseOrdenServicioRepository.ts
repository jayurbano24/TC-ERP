import { LOG_ORDEN_SERVICIO_SELECT } from '@/shared/constants/dbProjections';
import { SupabaseClient } from '@supabase/supabase-js';
import { injectable, inject } from 'tsyringe';
import { IOrdenServicioRepository } from '../../domain/repositories/IOrdenServicioRepository';
import { OrdenServicioAggregate } from '../../domain/aggregates/OrdenServicioAggregate';
import { OrdenServicioMapper } from '../mappers/OrdenServicioMapper';

@injectable()
export class SupabaseOrdenServicioRepository implements IOrdenServicioRepository {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient,
    @inject(OrdenServicioMapper) private readonly mapper: OrdenServicioMapper
  ) {}

  async findById(id: string): Promise<OrdenServicioAggregate | null> {
    const { data, error } = await this.supabase
      .from('log_orden_servicio')
      .select(LOG_ORDEN_SERVICIO_SELECT)
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !data) return null;
    return this.mapper.toDomain(data);
  }

  async findAll(): Promise<OrdenServicioAggregate[]> {
    const { data, error } = await this.supabase
      .from('log_orden_servicio')
      .select(LOG_ORDEN_SERVICIO_SELECT)
      .eq('is_deleted', false);

    if (error || !data) return [];
    return data.map((row: any) => this.mapper.toDomain(row));
  }

  async save(entity: OrdenServicioAggregate): Promise<void> {
    const persistence = this.mapper.toPersistence(entity);

    // TX-02: equipo + orden + outbox se persisten atómicamente en create_recepcion_tx
    // (transactional outbox real). El dual-write legacy queda best-effort dentro de la TX.
    const equipoData = {
      id: entity.props.equipo.id,
      numero_serie: entity.props.equipo.numeroSerie,
      marca: entity.props.equipo.marca,
      modelo: entity.props.equipo.modelo,
      tipo_dispositivo: entity.props.equipo.tipoDispositivo,
      tenant_id: entity.tenantId,
      branch_id: entity.branchId,
    };

    const guideNumber =
      entity.props.tipoRecepcion === 'CAC'
        ? entity.props.equipo.numeroSerie
        : entity.props.guiaPx || 'S/N';
    const carrier = entity.props.transporte || 'CARGO EXPRESO';

    const legacyData = {
      source: entity.props.tipoRecepcion.toLowerCase(),
      guide_number: guideNumber,
      carrier,
      received_units: 1,
      status: 'RECEPCIONADA',
      notes: `Piloto: ${carrier}\\nGuías: ${guideNumber}\\n\\n--- LÍNEA DE TIEMPO (MATRIZ) ---\\nGuías Procesadas: ${guideNumber}`,
    };

    const events = entity.domainEvents.map((event) => ({
      event_name: event.eventName,
      payload: event.payload,
    }));

    const { error } = await this.supabase.rpc('create_recepcion_tx', {
      p_equipo: equipoData,
      p_orden: persistence,
      p_legacy: legacyData,
      p_events: events,
    });

    if (error) throw new Error(`[RecepcionRepo] ${error.message}`);

    entity.clearEvents();
  }

  async delete(entity: OrdenServicioAggregate): Promise<void> {
    entity.markAsDeleted('system');
    await this.save(entity);
  }
}
