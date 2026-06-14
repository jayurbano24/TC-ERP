import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface AsistenciaProps {
  empleadoId: string;
  fecha: Date;
  entrada?: Date;
  salida?: Date;
  tipo: 'PRESENCIAL' | 'REMOTO' | 'FALTA' | 'PERMISO';
}

export class AsistenciaAggregate extends BaseAggregate<AsistenciaProps> {
  private constructor(id: string, tenantId: string, branchId: string, props: AsistenciaProps) {
    super(id, tenantId, branchId, props);
  }

  public static create(id: string, tenantId: string, branchId: string, props: AsistenciaProps): AsistenciaAggregate {
    return new AsistenciaAggregate(id, tenantId, branchId, props);
  }

  public marcarSalida(horaSalida: Date) {
    if (!this.props.entrada) {
      throw new Error('No se puede marcar salida sin haber marcado entrada.');
    }
    this.props.salida = horaSalida;
  }
}
