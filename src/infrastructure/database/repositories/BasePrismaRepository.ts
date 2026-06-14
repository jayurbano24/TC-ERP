import { BaseEntity } from '../../shared/domain/BaseEntity';
import { IRepository } from '../../shared/domain/IRepository';

export abstract class BasePrismaRepository<TEntity extends BaseEntity<any>, TPrismaModel> implements IRepository<TEntity> {
  protected readonly prisma: any; // Se inyectará el PrismaClient
  protected readonly mapper: any; // IMapper<TEntity, TPrismaModel>

  constructor(prismaClient: any, mapper: any) {
    this.prisma = prismaClient;
    this.mapper = mapper;
  }

  abstract get delegate(): any;

  async findById(id: string): Promise<TEntity | null> {
    const model = await this.delegate.findUnique({
      where: { id, is_deleted: false }
    });
    if (!model) return null;
    return this.mapper.toDomain(model);
  }

  async findAll(): Promise<TEntity[]> {
    const models = await this.delegate.findMany({
      where: { is_deleted: false }
    });
    return models.map((m: any) => this.mapper.toDomain(m));
  }

  async save(entity: TEntity): Promise<void> {
    const persistenceModel = this.mapper.toPersistence(entity);
    await this.delegate.upsert({
      where: { id: entity.id },
      update: persistenceModel,
      create: persistenceModel,
    });
  }

  async delete(entity: TEntity): Promise<void> {
    entity.markAsDeleted('system'); // En la realidad vendrá del RequestContext
    await this.save(entity);
  }
}
