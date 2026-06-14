export abstract class BaseEntity<T> {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly branchId: string;
  
  public readonly createdAt: Date;
  public createdBy: string | null;
  public updatedAt: Date;
  public updatedBy: string | null;
  
  public isDeleted: boolean;
  public deletedAt: Date | null;
  public deletedBy: string | null;
  public version: number;

  public readonly props: T;

  constructor(
    id: string,
    tenantId: string,
    branchId: string,
    props: T,
    createdAt?: Date,
    updatedAt?: Date,
    version?: number
  ) {
    this.id = id;
    this.tenantId = tenantId;
    this.branchId = branchId;
    this.props = props;
    
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
    this.version = version || 1;
    
    this.createdBy = null;
    this.updatedBy = null;
    
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
  }

  public markAsDeleted(deletedBy: string): void {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    this.incrementVersion();
  }

  protected incrementVersion(): void {
    this.version += 1;
    this.updatedAt = new Date();
  }
}
