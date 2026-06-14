import { BaseAggregate } from '../../../../shared/domain/BaseAggregate';

export interface ArticuloProps {
  codigo: string;
  nombre: string;
  tipo: 'REPUESTO' | 'EQUIPO' | 'CONSUMIBLE';
  stockActual: number;
  stockMinimo: number;
  precioUnitario: number;
}

export class ArticuloAggregate extends BaseAggregate<ArticuloProps> {
  private constructor(id: string, tenantId: string, branchId: string, props: ArticuloProps) {
    super(id, tenantId, branchId, props);
  }

  public static create(id: string, tenantId: string, branchId: string, props: ArticuloProps): ArticuloAggregate {
    const articulo = new ArticuloAggregate(id, tenantId, branchId, props);
    articulo.addDomainEvent({
      eventName: 'ArticuloCreadoDomainEvent',
      aggregateId: id,
      payload: { ...props, tenantId, branchId }
    });
    return articulo;
  }

  public ajustarStock(cantidad: number, tipoMovimiento: 'INGRESO' | 'SALIDA' | 'AJUSTE', motivo?: string, referenciaId?: string) {
    if (tipoMovimiento === 'SALIDA' && this.props.stockActual - cantidad < 0) {
      throw new Error(`Stock insuficiente para el artículo ${this.props.codigo}`);
    }

    if (tipoMovimiento === 'INGRESO' || tipoMovimiento === 'AJUSTE') {
      this.props.stockActual += cantidad;
    } else {
      this.props.stockActual -= cantidad;
    }

    this.addDomainEvent({
      eventName: 'StockAjustadoDomainEvent',
      aggregateId: this.id,
      payload: {
        cantidad,
        tipoMovimiento,
        stockResultante: this.props.stockActual,
        motivo,
        referenciaId
      }
    });
  }
}
