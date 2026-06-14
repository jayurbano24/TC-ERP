import { ArticuloAggregate } from '../aggregates/ArticuloAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';

export interface IInventarioRepository {
  getArticuloById(ctx: RequestContext, id: string): Promise<ArticuloAggregate | null>;
  getArticuloByCodigo(ctx: RequestContext, codigo: string): Promise<ArticuloAggregate | null>;
  saveArticulo(ctx: RequestContext, articulo: ArticuloAggregate): Promise<void>;
  
  // Guardamos los movimientos de forma cruda por rendimiento ya que son apend-only
  registrarMovimiento(ctx: RequestContext, payload: {
    articuloId: string;
    tipo: 'INGRESO' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo?: string;
    referenciaId?: string;
  }): Promise<void>;
}
