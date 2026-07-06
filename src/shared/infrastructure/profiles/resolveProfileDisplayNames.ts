import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function formatPersonName(raw: string): string {
  const name = raw.split('@')[0].trim();
  if (!name) return '---';
  if (name.includes(' ')) {
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * Resuelve nombres legibles de perfiles sin restricción RLS (service role).
 * Usado en historial de auditoría y trazabilidad para que todos los usuarios
 * vean quién realizó cada operación, no solo su propio perfil.
 */
export async function resolveProfileDisplayNames(
  userIds: string[],
  supabase?: SupabaseClient
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const db = supabase ?? getSupabaseServerClient();

  const { data: profilesData } = await db
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);

  if (!profilesData?.length) return {};

  const emailsToSearch = profilesData.map((p) => p.full_name).filter((n) => n?.includes('@'));
  let empMap: Record<string, string> = {};

  if (emailsToSearch.length > 0) {
    const { data: emps } = await db
      .from('employees')
      .select('email, nombre_completo')
      .in('email', emailsToSearch);
    if (emps) {
      empMap = emps.reduce((acc: Record<string, string>, e) => {
        if (e.email && e.nombre_completo) acc[e.email] = e.nombre_completo;
        return acc;
      }, {});
    }
  }

  return profilesData.reduce((acc: Record<string, string>, p) => {
    let name = p.full_name || '';
    if (name.includes('@')) {
      name = empMap[name] || name.split('@')[0];
    }
    if (name) acc[p.id] = formatPersonName(name);
    return acc;
  }, {});
}
