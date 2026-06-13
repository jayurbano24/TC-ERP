import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AdvancedAuditPayload {
  module: string;
  tableName: string;
  recordId: string;
  action: string;
  severity?: AuditSeverity;
  oldValues?: any;
  newValues?: any;
  branchId?: string;
  observations?: string;
}

// Retro-compatibility with the old logAudit function
export async function logAudit(tableName: string, recordId: string, action: string, payload: any = {}) {
  return logAdvancedAudit({
    module: 'Legacy',
    tableName,
    recordId,
    action,
    severity: 'INFO',
    newValues: payload
  });
}

export async function logAdvancedAudit(params: AdvancedAuditPayload) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const changed_by = user?.id || null;

    // Fetch user role if possible
    let user_role = 'Desconocido';
    if (changed_by) {
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', changed_by).single();
      if (roleData) {
        user_role = roleData.role;
      }
    }

    const user_agent = typeof window !== 'undefined' ? window.navigator.userAgent : 'Server';

    const isServer = typeof window === 'undefined';
    const baseUrl = isServer ? (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') : '';

    // Use the server-side API route to bypass RLS on erp_audit_logs
    const response = await fetch(`${baseUrl}/api/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: changed_by,
        user_role,
        branch_id: params.branchId,
        module: params.module,
        table_name: params.tableName,
        record_id: params.recordId,
        action: params.action,
        severity: params.severity || 'INFO',
        old_values: params.oldValues,
        new_values: params.newValues,
        user_agent,
        observations: params.observations
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errorMsg = errData.error || `HTTP ${response.status}`;
      console.error("Error creating advanced audit log:", errorMsg);
      return { error: errorMsg };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}


export async function getSeriesHistory(recordIds: string | string[]) {
  const ids = Array.isArray(recordIds) ? recordIds : [recordIds];
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('erp_audit_logs')
    .select(`
      id,
      action,
      changed_at:created_at,
      payload:new_values,
      changed_by:user_id
    `)
    .in('record_id', ids)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching audit logs:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const userIds = Array.from(new Set(data.map((d: any) => d.changed_by).filter(Boolean)));
  
  let profiles: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
      
    if (profilesData) {
      const emailsToSearch = profilesData.map(p => p.full_name).filter(n => n?.includes('@'));
      let empMap: Record<string, string> = {};
      
      if (emailsToSearch.length > 0) {
         const { data: emps } = await supabase.from('employees').select('email, nombre_completo').in('email', emailsToSearch);
         if (emps) {
            empMap = emps.reduce((acc: any, e: any) => {
               if (e.email && e.nombre_completo) acc[e.email] = e.nombre_completo;
               return acc;
            }, {});
         }
      }

      profiles = profilesData.reduce((acc: any, p: any) => {
        let name = p.full_name;
        if (name && name.includes('@')) {
           if (empMap[name]) {
              name = empMap[name];
           } else {
              name = name.split('@')[0];
           }
        }
        acc[p.id] = name;
        return acc;
      }, {});
    }
  }

  return data.map((d: any) => ({
    ...d,
    profiles: d.changed_by ? { full_name: profiles[d.changed_by] || 'SISTEMA' } : null
  }));
}

export async function getAdvancedAuditLogs(filters?: {
  module?: string;
  severity?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: [], count: 0 };

  let query = supabase
    .from('erp_audit_logs')
    .select('*', { count: 'exact' });

  if (filters?.module) query = query.eq('module', filters.module);
  if (filters?.severity) query = query.eq('severity', filters.severity);
  if (filters?.action) query = query.eq('action', filters.action);
  if (filters?.startDate) query = query.gte('created_at', filters.startDate);
  if (filters?.endDate) query = query.lte('created_at', filters.endDate);

  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching advanced audit logs:", error);
    return { data: [], count: 0 };
  }

  if (!data || data.length === 0) return { data: [], count: count || 0 };

  const userIds = Array.from(new Set(data.map(d => d.user_id).filter(Boolean)));
  
  let profiles: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
      
    if (profilesData) {
      const emailsToSearch = profilesData.map(p => p.full_name).filter(n => n?.includes('@'));
      let empMap: Record<string, string> = {};
      
      if (emailsToSearch.length > 0) {
         const { data: emps } = await supabase.from('employees').select('email, nombre_completo').in('email', emailsToSearch);
         if (emps) {
            empMap = emps.reduce((acc: any, e: any) => {
               if (e.email && e.nombre_completo) acc[e.email] = e.nombre_completo;
               return acc;
            }, {});
         }
      }

      profiles = profilesData.reduce((acc: any, p: any) => {
        let name = p.full_name;
        if (name && name.includes('@')) {
           if (empMap[name]) {
              name = empMap[name];
           } else {
              name = name.split('@')[0];
           }
        }
        acc[p.id] = name;
        return acc;
      }, {});
    }
  }

  const enrichedData = data.map((d: any) => ({
    ...d,
    profiles: d.user_id ? { full_name: profiles[d.user_id] || 'SISTEMA' } : null
  }));

  return { data: enrichedData, count: count || 0 };
}

// Retro-compatibility for getGlobalAuditLogs
export async function getGlobalAuditLogs(limit = 100) {
  const { data } = await getAdvancedAuditLogs({ limit });
  return data.map((d: any) => ({
    id: d.id,
    table_name: d.table_name,
    record_id: d.record_id,
    action: d.action,
    changed_at: d.created_at,
    payload: d.new_values,
    changed_by: d.user_id,
    profiles: d.profiles || { full_name: 'Usuario Desconocido' }
  }));
}
