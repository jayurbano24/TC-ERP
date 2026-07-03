import { fetchSessionActor } from '@/lib/api/sessionActor';

export type ReceptionActor = {
  userId: string | null;
  fullName: string;
};

/** Usuario autenticado que realiza la recepción — resuelto vía GET /api/v1/session/actor. */
export async function getCurrentReceptionActor(): Promise<ReceptionActor> {
  const actor = await fetchSessionActor();
  if (!actor) {
    return { userId: null, fullName: 'OPERADOR_SISTEMA' };
  }
  return { userId: actor.userId, fullName: actor.fullName };
}
