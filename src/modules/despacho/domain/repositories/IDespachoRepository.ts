import { RequestContext } from '../../../../shared/context/RequestContext';
import { DespachoAggregate } from '../aggregates/DespachoAggregate';

export interface IDespachoRepository {
  save(ctx: RequestContext, despacho: DespachoAggregate): Promise<void>;
  getById(ctx: RequestContext, id: string): Promise<DespachoAggregate | null>;
  getByReparacionId(ctx: RequestContext, reparacionId: string): Promise<DespachoAggregate | null>;
}
