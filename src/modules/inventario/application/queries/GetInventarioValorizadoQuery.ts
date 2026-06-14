import { IQuery } from '../../../../modules/recepcion/application/cqrs/IQuery';

export class GetInventarioValorizadoQuery implements IQuery {
  readonly queryName = 'GetInventarioValorizado';

  constructor(public readonly filtros?: any) {}
}
