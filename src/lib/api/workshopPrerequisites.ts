import { apiFetch } from '@/lib/http/apiFetch';

export type WorkshopPrerequisiteResult = {
  ok: boolean;
  message: string;
  seriesId?: string;
  missingLabel?: string;
};

export async function validateWorkshopPrerequisitesViaApi(
  seriesIds: string[],
  actionName: string
): Promise<WorkshopPrerequisiteResult> {
  const ids = [...new Set(seriesIds.filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, message: 'No hay series seleccionadas.' };
  }

  const params = new URLSearchParams({
    series_ids: ids.join(','),
    action_name: actionName,
  });

  const res = await apiFetch(`/api/v1/workshop/validate-prerequisites?${params}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as WorkshopPrerequisiteResult;
}

export function actionNameForTab(tab: string): string {
  switch (tab) {
    case 'diagnostico':
      return 'DIAGNÓSTICO INICIAL COMPLETADO';
    case 'reparacion':
      return 'REPARACIÓN COMPLETADA';
    case 'reacondicionado':
      return 'REACONDICIONADO COMPLETADO';
    case 'qc':
      return 'CONTROL DE CALIDAD COMPLETADO';
    default:
      return 'OPERACIÓN COMPLETADA';
  }
}
