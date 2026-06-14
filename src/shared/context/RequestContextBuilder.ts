import { RequestContext } from './RequestContext';

export class RequestContextBuilder {
  private tenantId!: string;
  private branchId!: string;
  private userId!: string;
  private roles: string[] = [];
  private moduleName?: string;

  withTenant(tenantId: string) {
    this.tenantId = tenantId;
    return this;
  }

  withBranch(branchId: string) {
    this.branchId = branchId;
    return this;
  }

  withUser(userId: string, roles: string[] = []) {
    this.userId = userId;
    this.roles = roles;
    return this;
  }

  withModule(moduleName: string) {
    this.moduleName = moduleName;
    return this;
  }

  build(): RequestContext {
    if (!this.tenantId || !this.branchId || !this.userId) {
      throw new Error('Tenant, Branch, and User are required for RequestContext');
    }
    return new RequestContext({
      tenantId: this.tenantId,
      branchId: this.branchId,
      userId: this.userId,
      roles: this.roles,
      moduleName: this.moduleName
    });
  }
}
