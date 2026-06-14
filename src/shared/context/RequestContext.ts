export class RequestContext {
  public readonly tenantId: string;
  public readonly branchId: string;
  public readonly userId: string;
  public readonly roles: string[];
  public readonly moduleName?: string;
  public readonly correlationId: string;

  constructor(params: {
    tenantId: string;
    branchId: string;
    userId: string;
    roles?: string[];
    moduleName?: string;
    correlationId?: string;
  }) {
    this.tenantId = params.tenantId;
    this.branchId = params.branchId;
    this.userId = params.userId;
    this.roles = params.roles || [];
    this.moduleName = params.moduleName;
    this.correlationId = params.correlationId || crypto.randomUUID();
  }
}

export { RequestContextBuilder } from './RequestContextBuilder';
