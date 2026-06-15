import { z } from 'zod';
import { ZodValidator } from '../../../../shared/validation/ZodValidator';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { SupabaseClient } from '@supabase/supabase-js';

const AssignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid()
});

export type AssignRoleDTO = z.infer<typeof AssignRoleSchema>;

export class AssignRoleCommand {
  constructor(private readonly supabase: SupabaseClient) {}

  async execute(ctx: RequestContext, dto: AssignRoleDTO): Promise<void> {
    const data = ZodValidator.validate(AssignRoleSchema, dto);

    // Verificar si el rol pertenece al tenant (prevención Data Leak)
    const { data: role } = await this.supabase
      .from('role')
      .select('id')
      .eq('id', data.roleId)
      .eq('tenant_id', ctx.tenantId)
      .eq('is_deleted', false)
      .single();

    if (!role) {
      throw new Error('Role not found or unauthorized');
    }

    await this.supabase
      .from('user_role')
      .upsert(
        {
          user_id: data.userId,
          role_id: data.roleId,
          tenant_id: ctx.tenantId,
        },
        { onConflict: 'user_id,role_id,tenant_id' }
      );
  }
}
