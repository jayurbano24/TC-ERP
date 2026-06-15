import { IQuery } from './IQuery';
import { RequestContext } from '../../../../shared/context/RequestContext';

export interface IQueryHandler<TQuery extends IQuery, TResult> {
  execute(query: TQuery, ctx: RequestContext): Promise<TResult>;
}
