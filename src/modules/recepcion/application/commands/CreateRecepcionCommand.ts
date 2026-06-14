import { ICommand } from '../cqrs/ICommand';
import { CreateRecepcionDTO } from '../dto/RecepcionDTO';

export class CreateRecepcionCommand implements ICommand {
  readonly commandName = 'CreateRecepcion';

  constructor(
    public readonly tipo: 'CAC' | 'PX',
    public readonly payload: CreateRecepcionDTO
  ) {}
}
