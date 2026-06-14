export interface IMapper<TDomainEntity, TPersistenceModel> {
  toDomain(raw: TPersistenceModel): TDomainEntity;
  toPersistence(entity: TDomainEntity): TPersistenceModel;
}
