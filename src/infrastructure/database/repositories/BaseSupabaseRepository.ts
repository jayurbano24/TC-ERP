import { SupabaseClient } from '@supabase/supabase-js';
import { BaseEntity } from '../../../shared/domain/BaseEntity';
import { IRepository } from '../../../shared/domain/IRepository';

/**
 * Repositorio base genérico. Las subclases deben sobrescribir `selectColumns`
 * con proyección explícita; el default queda acotado a `id` (no select('*')).
 */
export abstract class BaseSupabaseRepository<TEntity extends BaseEntity<any>>
  implements IRepository<TEntity>
{
  constructor(
    protected readonly supabase: SupabaseClient,
    protected readonly tableName: string
  ) {}

  protected get selectColumns(): string {
    return 'id';
  }

  async findById(id: string): Promise<TEntity | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(this.selectColumns)
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !data) return null;
    return this.toDomain(data);
  }

  async findAll(): Promise<TEntity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(this.selectColumns)
      .eq('is_deleted', false);

    if (error || !data) return [];
    return data.map((row: any) => this.toDomain(row));
  }

  async save(entity: TEntity): Promise<void> {
    const persistence = this.toPersistence(entity);
    const { error } = await this.supabase
      .from(this.tableName)
      .upsert(persistence, { onConflict: 'id' });

    if (error) throw new Error(`[${this.tableName}] Save error: ${error.message}`);
  }

  async delete(entity: TEntity): Promise<void> {
    entity.markAsDeleted('system');
    await this.save(entity);
  }

  protected abstract toDomain(row: any): TEntity;
  protected abstract toPersistence(entity: TEntity): any;
}
