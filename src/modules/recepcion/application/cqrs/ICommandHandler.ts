import { ICommand } from './ICommand';
import { RequestContext } from '../../../../shared/context/RequestContext';

export interface ICommandHandler<TCommand extends ICommand, TResult = void> {
  execute(command: TCommand, ctx: RequestContext): Promise<TResult>;
}
