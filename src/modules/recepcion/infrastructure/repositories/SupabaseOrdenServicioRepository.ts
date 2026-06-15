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
      .select('*, equipo:log_equipo(*)')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !data) return null;
    return this.mapper.toDomain(data);
  }

  async findAll(): Promise<OrdenServicioAggregate[]> {
    const { data, error } = await this.supabase
      .from('log_orden_servicio')
      .select('*, equipo:log_equipo(*)')
      .eq('is_deleted', false);

    if (error || !data) return [];
    return data.map((row: any) => this.mapper.toDomain(row));
  }

  async save(entity: OrdenServicioAggregate): Promise<void> {
    const persistence = this.mapper.toPersistence(entity);
    const domainEvents = entity.domainEvents;

    // 1. Upsert del equipo
    const equipoData = {
      id: entity.props.equipo.id,
      numero_serie: entity.props.equipo.numeroSerie,
      marca: entity.props.equipo.marca,
      modelo: entity.props.equipo.modelo,
      tipo_dispositivo: entity.props.equipo.tipoDispositivo,
      tenant_id: entity.tenantId,
      branch_id: entity.branchId,
    };

    const { error: equipoError } = await this.supabase
      .from('log_equipo')
      .upsert(equipoData, { onConflict: 'id' });

    if (equipoError) throw new Error(`[EquipoRepo] ${equipoError.message}`);

    // 2. Upsert de la orden
    const { error: ordenError } = await this.supabase
      .from('log_orden_servicio')
      .upsert(persistence, { onConflict: 'id' });

    if (ordenError) throw new Error(`[OrdenRepo] ${ordenError.message}`);

    // DUAL-WRITE: Backward compatibility con tablas legacy (Strangler Fig)
    const { error: legacyError } = await this.supabase
      .from('receptions')
      .insert({
         source: entity.props.tipoRecepcion.toLowerCase(),
         guide_number: entity.props.tipoRecepcion === 'CAC' ? entity.props.equipo.numeroSerie : (entity.props.guiaPx || 'S/N'),
         carrier: entity.props.transporte || 'CARGO EXPRESO',
         received_units: 1,
         status: 'RECEPCIONADA',
         notes: `Piloto: ${entity.props.transporte || 'CARGO EXPRESO'}\\nGuías: ${entity.props.tipoRecepcion === 'CAC' ? entity.props.equipo.numeroSerie : (entity.props.guiaPx || 'S/N')}\\n\\n--- LÍNEA DE TIEMPO (MATRIZ) ---\\nGuías Procesadas: ${entity.props.tipoRecepcion === 'CAC' ? entity.props.equipo.numeroSerie : (entity.props.guiaPx || 'S/N')}`,
      });
      
    // Ignoramos el legacyError de manera silenciosa para no romper el Command CQRS si la tabla legacy falla.

    // 3. Insertar eventos de dominio en Outbox
    for (const event of domainEvents) {
      const { error: outboxError } = await this.supabase
        .from('outbox_event')
        .insert({
          event_name: event.eventName,
          payload: JSON.stringify(event.payload),
          status: 'PENDING',
        });
      if (outboxError) throw new Error(`[OutboxRepo] ${outboxError.message}`);
    }

    entity.clearEvents();
  }

  async delete(entity: OrdenServicioAggregate): Promise<void> {
    entity.markAsDeleted('system');
    await this.save(entity);
  }
}
