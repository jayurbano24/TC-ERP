import { SupabaseClient } from '@supabase/supabase-js';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class CheckPermissionQuery {
  constructor(private readonly supabase: SupabaseClient) {}

  async execute(ctx: RequestContext, permissionCode: string): Promise<boolean> {
    // Obtener roles del usuario con sus permisos via join
    const { data: userRoles } = await this.supabase
      .from('user_role')
      .select(`
        role:role_id (
          is_deleted,
          role_permission (
            permission:permission_id ( code )
          )
        )
      `)
      .eq('user_id', ctx.userId)
      .eq('tenant_id', ctx.tenantId);

    if (!userRoles) return false;

    for (const userRole of userRoles) {
      const role = (userRole as any).role;
      if (!role || role.is_deleted) continue;

      const hasPermission = role.role_permission?.some(
        (rp: any) => rp.permission?.code === permissionCode
      );
      if (hasPermission) return true;
    }

    return false;
  }
}
