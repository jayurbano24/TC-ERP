import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { RequestContext } from '../../../shared/context/RequestContext';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

export function getTenantPrisma(ctx: RequestContext) {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Modelos que NO tienen tenant_id o no deben filtrarse por seguridad
          const bypassModels = ['Tenant', 'OutboxEvent', 'DomainEvent'];
          
          if (!bypassModels.includes(model)) {
            // Inyectar tenant_id en lecturas
            if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(operation)) {
              args.where = { ...args.where, tenant_id: ctx.tenantId };
            }
            // Inyectar tenant_id en escrituras
            if (['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
              if (args.data) {
                // @ts-ignore
                args.data.tenant_id = ctx.tenantId;
              }
              if (args.where) {
                args.where = { ...args.where, tenant_id: ctx.tenantId };
              }
            }
          }
          return query(args);
        },
      },
    },
  });
}

export default basePrisma;
