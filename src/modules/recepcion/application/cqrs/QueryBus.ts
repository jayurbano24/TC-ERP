import { injectable } from 'tsyringe';
import { IQuery } from './IQuery';
import { IQueryHandler } from './IQueryHandler';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { container } from '../../../../shared/di/container';

@injectable()
export class QueryBus {
  async execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    ctx: RequestContext
  ): Promise<TResult> {
    const handlerName = `${query.queryName}Handler`;
    
    // Resolve handler from the container based on query name
    const handler = container.resolve<IQueryHandler<TQuery, TResult>>(handlerName);
    
    if (!handler) {
      throw new Error(`QueryHandler not found for: ${query.queryName}`);
    }

    return handler.execute(query, ctx);
  }
}
