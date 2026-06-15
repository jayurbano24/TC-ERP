import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface InventarioProps {
  sku: string;
  cantidad: number;
  ubicacion?: string;
  estado: 'DISPONIBLE' | 'RESERVADO' | 'EN_TRANSITO';
  origenId?: string; // Ej: ID de Recepcion
}

export class InventarioAggregate extends BaseAggregate<InventarioProps> {
  private constructor(
    id: string,
    tenantId: string,
    branchId: string,
    props: InventarioProps
  ) {
    super(id, tenantId, branchId, props);
  }

  // Factory method para creación regular
  public static create(
    id: string,
    tenantId: string,
    branchId: string,
    props: InventarioProps
  ): InventarioAggregate {
    if (props.cantidad < 0) {
      throw new Error('La cantidad inicial de inventario no puede ser negativa.');
    }

    const inventario = new InventarioAggregate(id, tenantId, branchId, props);
    
    // Aquí podríamos emitir un InventarioCreatedEvent si fuera necesario
    return inventario;
  }

  // Factory method específico desde Recepción (Domain Isolation respected)
  public static createFromRecepcion(
    id: string,
    tenantId: string,
    branchId: string,
    recepcionId: string,
    sku: string,
    cantidad: number
  ): InventarioAggregate {
    if (cantidad <= 0) {
      throw new Error('La cantidad recibida debe ser mayor a cero.');
    }

    const props: InventarioProps = {
      sku,
      cantidad,
      estado: 'EN_TRANSITO', // Inicialmente en tránsito hasta ser ubicado en bodega
      origenId: recepcionId
    };

    return new InventarioAggregate(id, tenantId, branchId, props);
  }
}
