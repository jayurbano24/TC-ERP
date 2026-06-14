import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface DespachoProps {
  reparacionId: string;
  clienteNombre: string;
  equipoInfo: string;
  estado: 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO';
  direccion?: string;
  trackingCode?: string;
  fechaEntrega?: Date;
}

export class DespachoAggregate extends BaseAggregate<DespachoProps> {
  private constructor(id: string, tenantId: string, branchId: string, props: DespachoProps) {
    super(id, tenantId, branchId, props);
  }

  public static create(id: string, tenantId: string, branchId: string, props: DespachoProps): DespachoAggregate {
    const despacho = new DespachoAggregate(id, tenantId, branchId, props);
    despacho.addDomainEvent({
      eventName: 'DespachoCreadoDomainEvent',
      aggregateId: id,
      payload: { ...props, tenantId, branchId }
    });
    return despacho;
  }

  public confirmarEntrega(fechaEntrega: Date) {
    this.props.estado = 'ENTREGADO';
    this.props.fechaEntrega = fechaEntrega;
    this.addDomainEvent({
      eventName: 'DespachoEntregadoDomainEvent',
      aggregateId: this.id,
      payload: { fechaEntrega }
    });
  }

  public enrutar(trackingCode: string, direccion: string) {
    this.props.estado = 'EN_RUTA';
    this.props.trackingCode = trackingCode;
    this.props.direccion = direccion;
    this.addDomainEvent({
      eventName: 'DespachoEnRutadoDomainEvent',
      aggregateId: this.id,
      payload: { trackingCode, direccion }
    });
  }
}
