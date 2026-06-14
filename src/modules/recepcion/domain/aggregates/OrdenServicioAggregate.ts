import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';
import { RecepcionCreatedEvent } from '../events/RecepcionCreatedEvent';

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
    tipo: 'CAC' | 'PX',
    props: Omit<OrdenServicioProps, 'tipoRecepcion'>
  ): OrdenServicioAggregate {
    
    // Reglas de negocio (CAC vs PX)
    if (tipo === 'PX') {
      if (!props.guiaPx || !props.transporte) {
        throw new Error('Para recepciones PX, la guía y el transporte son obligatorios.');
      }
    }

    const fullProps: OrdenServicioProps = {
      ...props,
      tipoRecepcion: tipo,
    };

    const orden = new OrdenServicioAggregate(id, tenantId, branchId, fullProps);
    
    // Registrar Domain Event
    const eventItems = [{ sku: props.equipo.numeroSerie, cantidad: 1 }]; // Dummy item mapping for now
    orden.addDomainEvent(new RecepcionCreatedEvent(id, tipo, eventItems, tenantId, branchId));
    
    return orden;
  }
}
