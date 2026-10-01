import { ValidationException } from '@/shared/errors/Exceptions';
import { PREDIAGNOSTICO_BATCH_MAX } from './batchSelection';
import {
  validatePrediagnostico,
  type PrediagnosticoInput,
  type ShellClass,
  type Verdict,
} from './validatePrediagnostico';

export type PrediagnosticoRecord = {
  id: string;
  serviceOrderId: string;
  shellClass: ShellClass;
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
  verdict: Verdict;
  notes: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
};

export type PrediagnosticoActor = {
  userId: string;
  userName: string;
};

export type PrediagnosticoStore = {
  findByServiceOrder(serviceOrderId: string): Promise<PrediagnosticoRecord | null>;
  insert(record: PrediagnosticoRecord): Promise<PrediagnosticoRecord>;
  update(id: string, record: PrediagnosticoRecord): Promise<PrediagnosticoRecord>;
  insertRevision(record: PrediagnosticoRecord): Promise<void>;
};

export async function savePrediagnostico(
  store: PrediagnosticoStore,
  actor: PrediagnosticoActor,
  input: PrediagnosticoInput,
  now: Date = new Date()
): Promise<PrediagnosticoRecord> {
  const errors = validatePrediagnostico(input);
  if (errors.length > 0) {
    throw new ValidationException(errors[0], errors);
  }

  const existing = await store.findByServiceOrder(input.serviceOrderId);
  const stamp = now.toISOString();
  const next: PrediagnosticoRecord = {
    id: existing?.id || crypto.randomUUID(),
    serviceOrderId: input.serviceOrderId,
    shellClass: input.shellClass as ShellClass,
    cosmetics: input.cosmetics,
    functionChecks: input.functionChecks,
    verdict: input.verdict as Verdict,
    notes: input.notes.trim(),
    createdBy: existing?.createdBy || actor.userId,
    createdByName: existing?.createdByName || actor.userName,
    createdAt: existing?.createdAt || stamp,
    updatedBy: actor.userId,
    updatedByName: actor.userName,
    updatedAt: stamp,
  };

  const saved = existing ? await store.update(existing.id, next) : await store.insert(next);
  await store.insertRevision(saved);
  return saved;
}

export async function savePrediagnosticoBatch(
  store: PrediagnosticoStore,
  actor: PrediagnosticoActor,
  input: Omit<PrediagnosticoInput, 'serviceOrderId'>,
  serviceOrderIds: string[],
  now: Date = new Date()
): Promise<PrediagnosticoRecord[]> {
  if (serviceOrderIds.length < 1 || serviceOrderIds.length > PREDIAGNOSTICO_BATCH_MAX) {
    throw new ValidationException(`Selecciona entre 1 y ${PREDIAGNOSTICO_BATCH_MAX} órdenes`);
  }
  const sample: PrediagnosticoInput = { ...input, serviceOrderId: serviceOrderIds[0] || '' };
  const errors = validatePrediagnostico(sample);
  if (errors.length > 0) {
    throw new ValidationException(errors[0] || 'Prediagnóstico incompleto', errors);
  }
  const saved: PrediagnosticoRecord[] = [];
  for (const serviceOrderId of serviceOrderIds) {
    saved.push(await savePrediagnostico(store, actor, { ...input, serviceOrderId }, now));
  }
  return saved;
}
