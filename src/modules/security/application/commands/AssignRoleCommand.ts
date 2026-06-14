import { z } from 'zod';
import { ZodValidator } from '../../../../shared/validation/ZodValidator';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { PrismaClient } from '@prisma/client';

const AssignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid()
});

export type AssignRoleDTO = z.infer<typeof AssignRoleSchema>;

export class AssignRoleCommand {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(ctx: RequestContext, dto: AssignRoleDTO): Promise<void> {
    const data = ZodValidator.validate(AssignRoleSchema, dto);
    
    // Verificar si el rol pertenece al tenant (prevención Data Leak)
    const role = await this.prisma.role.findFirst({
      where: { id: data.roleId, tenant_id: ctx.tenantId, is_deleted: false }
    });

    if (!role) {
      throw new Error('Role not found or unauthorized');
    }

    await this.prisma.userRole.upsert({
      where: {
        user_id_role_id_tenant_id: {
          user_id: data.userId,
          role_id: data.roleId,
          tenant_id: ctx.tenantId
        }
      },
      update: {},
      create: {
        user_id: data.userId,
        role_id: data.roleId,
        tenant_id: ctx.tenantId
      }
    });
  }
}
