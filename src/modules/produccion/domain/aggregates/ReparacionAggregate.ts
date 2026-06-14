import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface ReparacionProps {
  diagnosticoId: string;
  tecnicoId?: string;
  estado: 'ESPERA_REPUESTOS' | 'REPARANDO' | 'PRUEBAS' | 'FINALIZADO';
  repuestosUsados?: string; // JSON
  tiempoInvertido?: number; // en minutos
}

export class ReparacionAggregate extends BaseAggregate<ReparacionProps> {
  private constructor(id: string, tenantId: string, branchId: string, props: ReparacionProps) {
    super(id, tenantId, branchId, props);
  }

  public static create(id: string, tenantId: string, branchId: string, props: ReparacionProps): ReparacionAggregate {
    const reparacion = new ReparacionAggregate(id, tenantId, branchId, props);
    reparacion.addDomainEvent({
      eventName: 'ReparacionCreadaDomainEvent',
      aggregateId: id,
      payload: { ...props, tenantId, branchId }
    });
    return reparacion;
  }

  public iniciarReparacion(tecnicoId: string) {
    this.props.tecnicoId = tecnicoId;
    this.props.estado = 'REPARANDO';
    this.addDomainEvent({
      eventName: 'ReparacionIniciadaDomainEvent',
      aggregateId: this.id,
      payload: { tecnicoId: this.props.tecnicoId }
    });
  }

  public registrarRepuestos(repuestosJson: string) {
    this.props.repuestosUsados = repuestosJson;
    // Esto podría emitir un evento que escuche el módulo de Inventario
    this.addDomainEvent({
      eventName: 'RepuestosRegistradosDomainEvent',
      aggregateId: this.id,
      payload: { repuestosJson }
    });
  }

  public finalizar(tiempoMinutos: number) {
    this.props.estado = 'FINALIZADO';
    this.props.tiempoInvertido = tiempoMinutos;
    this.addDomainEvent({
      eventName: 'ReparacionFinalizadaDomainEvent',
      aggregateId: this.id,
      payload: { tiempoMinutos }
    });
  }
}
