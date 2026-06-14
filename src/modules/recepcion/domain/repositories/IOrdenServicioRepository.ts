import { IRepository } from '../../../../shared/domain/IRepository';
import { OrdenServicioAggregate } from '../aggregates/OrdenServicioAggregate';

export interface IOrdenServicioRepository extends IRepository<OrdenServicioAggregate> {
  // Aquí se podrían agregar métodos de búsqueda específicos como findByNumeroSerie
}
