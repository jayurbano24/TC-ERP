import { PrismaClient } from '@prisma/client';
import { injectable } from 'tsyringe';
import { RequestContext } from '../context/RequestContext';

@injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

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
    // Esto idealmente se encola o se hace de forma no bloqueante
    await this.prisma.auditLog.create({
      data: {
        tenant_id: ctx.tenantId,
        branch_id: ctx.branchId,
        user_id: ctx.userId,
        entity_type: entityType,
        entity_id: entityId,
        action,
        module: ctx.moduleName || 'system',
        duration_ms: durationMs,
        result,
        changes: {
          create: this.calculateChanges(oldValue, newValue)
        }
      }
    });
  }

  private calculateChanges(oldVal: any, newVal: any): any[] {
    const changes: any[] = [];
    if (!oldVal && !newVal) return changes;
    
    // Simplificación de cálculo de diff
    const keys = new Set([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})]);
    for (const key of keys) {
      const oldV = oldVal?.[key];
      const newV = newVal?.[key];
      if (oldV !== newV) {
        changes.push({
          field_name: key,
          old_value: oldV ? JSON.stringify(oldV) : null,
          new_value: newV ? JSON.stringify(newV) : null
        });
      }
    }
    return changes;
  }
}
