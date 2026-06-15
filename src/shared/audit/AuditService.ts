import { SupabaseClient } from '@supabase/supabase-js';
import { injectable, inject } from 'tsyringe';
import { RequestContext } from '../context/RequestContext';

@injectable()
export class AuditService {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  public async logAction(
    ctx: RequestContext,
    entityType: string,
    entityId: string,
    action: string,
    oldValue: any,
    newValue: any,
    durationMs?: number,
    result: string = 'SUCCESS'
  ): Promise<void> {
    const changes = this.calculateChanges(oldValue, newValue);

    await this.supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      user_id: ctx.userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      module: ctx.moduleName || 'system',
      duration_ms: durationMs,
      result,
      changes,
    });
  }

  private calculateChanges(oldVal: any, newVal: any): any[] {
    const changes: any[] = [];
    if (!oldVal && !newVal) return changes;

    const keys = new Set([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})]);
    for (const key of keys) {
      const oldV = oldVal?.[key];
      const newV = newVal?.[key];
      if (oldV !== newV) {
        changes.push({
          field_name: key,
          old_value: oldV ? JSON.stringify(oldV) : null,
          new_value: newV ? JSON.stringify(newV) : null,
        });
      }
    }
    return changes;
  }
}
