import { describe, expect, it } from 'vitest';
import { ValidationException } from '@/shared/errors/Exceptions';
import {
  savePrediagnostico,
  savePrediagnosticoBatch,
  type PrediagnosticoRecord,
  type PrediagnosticoStore,
} from './prediagnosticoService';

function memoryStore(): PrediagnosticoStore & { revisions: PrediagnosticoRecord[] } {
  let current: PrediagnosticoRecord | null = null;
  const revisions: PrediagnosticoRecord[] = [];
  return {
    revisions,
    async findByServiceOrder() {
      return current;
    },
    async insert(record) {
      current = record;
      return record;
    },
    async update(_id, record) {
      current = record;
      return record;
    },
    async insertRevision(record) {
      revisions.push(record);
    },
  };
}

const actor = { userId: 'user-1', userName: 'Johanna CAC' };
const valid = {
  serviceOrderId: 'os-1',
  shellClass: 'A',
  cosmetics: { puertos: 'bien' },
  functionChecks: { enciende: 'si' },
  verdict: 'reparado',
  notes: 'ok',
};

describe('savePrediagnostico', () => {
  it('no guarda si faltan clase o dictamen', async () => {
    const store = memoryStore();
    await expect(
      savePrediagnostico(store, actor, { ...valid, shellClass: null, verdict: null })
    ).rejects.toBeInstanceOf(ValidationException);
    expect(store.revisions).toHaveLength(0);
  });

  it('crea el registro y deja una revisión con usuario y fecha', async () => {
    const store = memoryStore();
    const now = new Date('2026-09-30T17:00:00.000Z');
    const saved = await savePrediagnostico(store, actor, valid, now);
    expect(saved.createdByName).toBe('Johanna CAC');
    expect(saved.createdAt).toBe(now.toISOString());
    expect(saved.updatedAt).toBe(now.toISOString());
    expect(store.revisions).toHaveLength(1);
  });

  it('al editar conserva la creación y agrega otra revisión', async () => {
    const store = memoryStore();
    const created = new Date('2026-09-30T17:00:00.000Z');
    await savePrediagnostico(store, actor, valid, created);
    const edited = new Date('2026-09-30T18:00:00.000Z');
    const saved = await savePrediagnostico(
      store,
      { userId: 'user-2', userName: 'Supervisor' },
      { ...valid, verdict: 'irreparable', notes: 'carcasa rota' },
      edited
    );
    expect(saved.createdBy).toBe('user-1');
    expect(saved.createdAt).toBe(created.toISOString());
    expect(saved.updatedByName).toBe('Supervisor');
    expect(saved.updatedAt).toBe(edited.toISOString());
    expect(store.revisions).toHaveLength(2);
    expect(store.revisions[1]?.verdict).toBe('irreparable');
  });
});

describe('savePrediagnosticoBatch', () => {
  it('aplica el mismo dictamen a cada orden y no escribe si falta la clase', async () => {
    const rows = new Map<string, PrediagnosticoRecord>();
    const revisions: PrediagnosticoRecord[] = [];
    const store: PrediagnosticoStore = {
      async findByServiceOrder(id) {
        return rows.get(id) || null;
      },
      async insert(record) {
        rows.set(record.serviceOrderId, record);
        return record;
      },
      async update(_id, record) {
        rows.set(record.serviceOrderId, record);
        return record;
      },
      async insertRevision(record) {
        revisions.push(record);
      },
    };
    const { serviceOrderId: _id, ...payload } = valid;
    await expect(savePrediagnosticoBatch(store, actor, { ...payload, shellClass: null }, ['os-1', 'os-2'])).rejects.toBeInstanceOf(
      ValidationException
    );
    expect(revisions).toHaveLength(0);

    const saved = await savePrediagnosticoBatch(store, actor, payload, ['os-1', 'os-2']);
    expect(saved.map((row) => row.serviceOrderId)).toEqual(['os-1', 'os-2']);
    expect(saved.every((row) => row.verdict === 'reparado' && row.shellClass === 'A')).toBe(true);
    expect(revisions).toHaveLength(2);
  });
});
