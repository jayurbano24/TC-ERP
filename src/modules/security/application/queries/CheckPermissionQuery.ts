import { PrismaClient } from '@prisma/client';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class CheckPermissionQuery {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(ctx: RequestContext, permissionCode: string): Promise<boolean> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { user_id: ctx.userId, tenant_id: ctx.tenantId },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } }
        }
      }
    });

    for (const userRole of userRoles) {
      if (userRole.role.is_deleted) continue;
      const hasPerm = userRole.role.permissions.some(rp => rp.permission.code === permissionCode);
      if (hasPerm) return true;
    }

    return false;
  }
}
