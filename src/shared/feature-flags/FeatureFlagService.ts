import { SupabaseClient } from '@supabase/supabase-js';
import { RequestContext } from '../context/RequestContext';
import { injectable, inject } from 'tsyringe';

@injectable()
export class FeatureFlagService {
  constructor(
    @inject('SupabaseClient') private readonly supabase: SupabaseClient
  ) {}

  async isEnabled(ctx: RequestContext, code: string): Promise<boolean> {
    // 1. Variable de entorno como override (sin necesidad de DB)
    //    Formato: FEATURE_FLAGS=FLAG_A,FLAG_B,FLAG_C
    const envFlags = process.env.FEATURE_FLAGS?.split(',').map(f => f.trim()) ?? [];
    if (envFlags.includes(code)) return true;

    // 2. Consultar Supabase con fallback graceful
    try {
      // Buscar flag a nivel de branch primero
      if (ctx.branchId) {
        const { data: branchFlag } = await this.supabase
          .from('feature_flag')
          .select('is_enabled')
          .eq('tenant_id', ctx.tenantId)
          .eq('branch_id', ctx.branchId)
          .eq('code', code)
          .single();

        if (branchFlag) return branchFlag.is_enabled;
      }

      // Fallback a nivel de tenant
      const { data: tenantFlag } = await this.supabase
        .from('feature_flag')
        .select('is_enabled')
        .eq('tenant_id', ctx.tenantId)
        .is('branch_id', null)
        .eq('code', code)
        .single();

      return tenantFlag ? tenantFlag.is_enabled : false;
    } catch {
      // DB no disponible → env var ya cubrió el caso
      return false;
    }
  }
}
