import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface EquipoProps {
  id: string;
  numeroSerie: string;
  marca?: string;
  modelo?: string;
  tipoDispositivo?: string;
}

export interface OrdenServicioProps {
  equipo: EquipoProps;
  tipoRecepcion: 'CAC' | 'PX';
  estadoRecepcion: string;
  fallaReportada?: string;
  diagnosticoInicial?: string;
  guiaPx?: string;
  transporte?: string;
}

export class OrdenServicioAggregate extends BaseAggregate<OrdenServicioProps> {
  private constructor(
    id: string,
    tenantId: string,
    branchId: string,
    props: OrdenServicioProps
  ) {
    super(id, tenantId, branchId, props);
  }

  public static create(
    id: string,
    tenantId: string,
    branchId: string,
    props: OrdenServicioProps
  ): OrdenServicioAggregate {
    const orden = new OrdenServicioAggregate(id, tenantId, branchId, props);
    // Registrar Domain Event
    orden.addDomainEvent({
      eventName: 'RecepcionCreadaDomainEvent',
      aggregateId: id,
      payload: { ...props, tenantId, branchId }
    });
    return orden;
  }
}
