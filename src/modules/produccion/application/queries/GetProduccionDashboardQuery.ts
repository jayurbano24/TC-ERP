import { IQuery } from '../../../../modules/recepcion/application/cqrs/IQuery';

export class GetProduccionDashboardQuery implements IQuery {
  readonly queryName = 'GetProduccionDashboard';

  constructor(public readonly filtros?: any) {}
}
