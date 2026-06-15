import type { ICommand } from '../../../recepcion/application/cqrs/ICommand';

export class CreateInventarioCommand implements ICommand {
  readonly commandName = 'CreateInventarioCommand';
  constructor(
    public readonly sku: string,
    public readonly cantidad: number,
    public readonly ubicacion?: string
  ) {}
}
