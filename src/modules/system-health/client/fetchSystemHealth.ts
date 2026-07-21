import { apiFetch } from '@/lib/http/apiFetch';
import type { SystemHealthReport } from '../types';

export async function fetchSystemHealth(): Promise<SystemHealthReport> {
  const res = await apiFetch('/api/v1/system/health');
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'No se pudo cargar el estado del sistema');
  }
  return json.health as SystemHealthReport;
}
