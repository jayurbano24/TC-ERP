import { SupabaseClient } from '@supabase/supabase-js';
import { BaseEntity } from '../../../shared/domain/BaseEntity';
import { IRepository } from '../../../shared/domain/IRepository';

export abstract class BaseSupabaseRepository<TEntity extends BaseEntity<any>>
  implements IRepository<TEntity>
{
  constructor(
    protected readonly supabase: SupabaseClient,
    protected readonly tableName: string
  ) {}

  async findById(id: string): Promise<TEntity | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !data) return null;
    return this.toDomain(data);
  }

  async findAll(): Promise<TEntity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
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
