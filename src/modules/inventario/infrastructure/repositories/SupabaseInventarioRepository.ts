import { SupabaseClient } from '@supabase/supabase-js';
import { injectable, inject } from 'tsyringe';
import type { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';
import type { InventarioAggregate } from '../../domain/aggregates/InventarioAggregate';

@injectable()
export class SupabaseInventarioRepository implements IInventarioRepository {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async save(inventario: InventarioAggregate): Promise<void> {
    const { error } = await this.supabase
      .from('inventario')
      .upsert({
        id: inventario.id,
        tenant_id: inventario.tenantId,
        branch_id: inventario.branchId,
      }, { onConflict: 'id' });

    if (error) throw new Error(`[InventarioRepo] ${error.message}`);
  }

  async findById(id: string): Promise<InventarioAggregate | null> {
    const { data, error } = await this.supabase
      .from('inventario')
      .select('id, tenant_id, branch_id')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    // TODO: Mapear a InventarioAggregate cuando el dominio esté completo
    return null;
  }
}
