import { InventarioAggregate } from '../aggregates/InventarioAggregate';

export interface IInventarioRepository {
  save(inventario: InventarioAggregate): Promise<void>;
  findById(id: string): Promise<InventarioAggregate | null>;
}
