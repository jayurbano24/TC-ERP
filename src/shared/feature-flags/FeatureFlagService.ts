import { PrismaClient } from '@prisma/client';
import { RequestContext } from '../context/RequestContext';
import { injectable, inject } from 'tsyringe';

@injectable()
export class FeatureFlagService {
  constructor(@inject('PrismaClient') private readonly prisma: PrismaClient) {}

  async isEnabled(ctx: RequestContext, code: string): Promise<boolean> {
    // Buscar primero a nivel de branch
    if (ctx.branchId) {
      const branchFlag = await this.prisma.featureFlag.findUnique({
        where: {
          tenant_id_branch_id_code: {
            tenant_id: ctx.tenantId,
            branch_id: ctx.branchId,
            code
          }
        }
      });
      if (branchFlag) return branchFlag.is_enabled;
    }

    // Fallback a nivel de tenant (branch_id nulo)
    // Ojo: en Prisma uniqueness con null es especial, por lo que findFirst es más seguro aquí
    const tenantFlag = await this.prisma.featureFlag.findFirst({
      where: {
        tenant_id: ctx.tenantId,
        branch_id: null,
        code
      }
    });

    return tenantFlag ? tenantFlag.is_enabled : false;
  }
}
