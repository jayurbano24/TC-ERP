import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface DiagnosticoProps {
  ordenLogisticaId: string;
  tecnicoId?: string;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO';
  observaciones?: string;
}

export class DiagnosticoAggregate extends BaseAggregate<DiagnosticoProps> {
  private constructor(id: string, tenantId: string, branchId: string, props: DiagnosticoProps) {
    super(id, tenantId, branchId, props);
  }

  public static create(id: string, tenantId: string, branchId: string, props: DiagnosticoProps): DiagnosticoAggregate {
    const diagnostico = new DiagnosticoAggregate(id, tenantId, branchId, props);
    diagnostico.addDomainEvent({
      eventName: 'DiagnosticoCreadoDomainEvent',
      aggregateId: id,
      payload: { ...props, tenantId, branchId }
    });
    return diagnostico;
  }

  public iniciarDiagnostico(tecnicoId: string) {
    this.props.tecnicoId = tecnicoId;
    this.props.estado = 'EN_PROCESO';
    this.addDomainEvent({
      eventName: 'DiagnosticoIniciadoDomainEvent',
      aggregateId: this.id,
      payload: { tecnicoId: this.props.tecnicoId }
    });
  }

  public completarDiagnostico(observaciones: string) {
    this.props.estado = 'COMPLETADO';
    this.props.observaciones = observaciones;
    this.addDomainEvent({
      eventName: 'DiagnosticoCompletadoDomainEvent',
      aggregateId: this.id,
      payload: { observaciones }
    });
  }
}
