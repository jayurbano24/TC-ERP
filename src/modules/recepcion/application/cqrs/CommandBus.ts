import { injectable } from 'tsyringe';
import { ICommand } from './ICommand';
import { ICommandHandler } from './ICommandHandler';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { container } from '../../../../shared/di/container';

@injectable()
export class CommandBus {
  async execute<TCommand extends ICommand, TResult = void>(
    command: TCommand,
    ctx: RequestContext
  ): Promise<TResult> {
    const handlerName = `${command.commandName}Handler`;
    
    // Resolve handler from the container based on command name
    const handler = container.resolve<ICommandHandler<TCommand, TResult>>(handlerName);
    
    if (!handler) {
      throw new Error(`CommandHandler not found for: ${command.commandName}`);
    }

    return handler.execute(command, ctx);
  }
}
