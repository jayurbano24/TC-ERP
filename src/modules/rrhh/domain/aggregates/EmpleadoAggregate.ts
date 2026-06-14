import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface EmpleadoProps {
  userId?: string;
  nombre: string;
  apellido: string;
  dni: string;
  cargo: string;
  departamento: string;
  estado: 'ACTIVO' | 'VACACIONES' | 'INACTIVO';
}

export class EmpleadoAggregate extends BaseAggregate<EmpleadoProps> {
  private constructor(id: string, tenantId: string, branchId: string, props: EmpleadoProps) {
    super(id, tenantId, branchId, props);
  }

  public static create(id: string, tenantId: string, branchId: string, props: EmpleadoProps): EmpleadoAggregate {
    const empleado = new EmpleadoAggregate(id, tenantId, branchId, props);
    empleado.addDomainEvent({
      eventName: 'EmpleadoCreadoDomainEvent',
      aggregateId: id,
      payload: { ...props, tenantId, branchId }
    });
    return empleado;
  }

  public cambiarEstado(nuevoEstado: 'ACTIVO' | 'VACACIONES' | 'INACTIVO') {
    this.props.estado = nuevoEstado;
    this.addDomainEvent({
      eventName: 'EstadoEmpleadoCambiadoDomainEvent',
      aggregateId: this.id,
      payload: { nuevoEstado }
    });
  }
}
