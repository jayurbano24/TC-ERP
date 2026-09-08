import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  patchPxCacheAfterCloseBox,
  patchPxCacheAfterReopenBox,
  ingestPxSnapshotToCache,
} from './pxMutationCache';
import { pxReceptionQueryKey } from './pxReceptionSnapshotQuery';
import type { PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';
import type { PxSnapshotCacheEntry } from './pxReceptionSession.types';

const RECEPTION_ID = 'rec-1';
const BOX_ID = 'box-1';

function buildSnapshot(version = 1): PxReceptionSnapshot {
  return {
    reception: {
      id: RECEPTION_ID,
      guide_number: 'REC-1',
      status: 'EN_PROCESO',
      sap_document: 'SAP',
      carrier: null,
      notes: null,
      expected_units: 10,
      expected_units_sap: 10,
      received_units: 0,
      variance_units: null,
      variance_reason: null,
      version,
      created_at: new Date().toISOString(),
    },
    boxes: [
      {
        id: BOX_ID,
        box_code: 'CAJA-1',
        status: 'en_captura',
        declared_quantity: 10,
        captured_count: 5,
        version: 2,
        brand_id: null,
        model_id: null,
        rejected_count: 0,
        locked_by: null,
        lock_expires_at: null,
        lots: [],
        equipment: [],
        rejections: [],
      },
    ],
    total_captured: 5,
  };
}

function seedCache(queryClient: QueryClient, entry: PxSnapshotCacheEntry) {
  queryClient.setQueryData(pxReceptionQueryKey(RECEPTION_ID), entry);
}

describe('pxMutationCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('TEST 3 closeBox — patch cache sin GET', () => {
    seedCache(queryClient, {
      snapshot: buildSnapshot(1),
      reason: 'START',
      includeEquipment: false,
      fetchedAt: Date.now(),
    });

    const patched = patchPxCacheAfterCloseBox(queryClient, RECEPTION_ID, {
      box_id: BOX_ID,
      status: 'cerrada',
      version: 3,
      captured_count: 5,
      declared_quantity: 10,
    });

    expect(patched).toBe(true);
    const entry = queryClient.getQueryData<PxSnapshotCacheEntry>(pxReceptionQueryKey(RECEPTION_ID));
    expect(entry?.snapshot.boxes[0]?.status).toBe('cerrada');
    expect(entry?.snapshot.boxes[0]?.version).toBe(3);
    expect(entry?.snapshot.reception.version).toBe(2);
  });

  it('TEST 3 reopenBox — patch cache sin GET', () => {
    const snap = buildSnapshot(2);
    snap.boxes[0]!.status = 'cerrada';
    seedCache(queryClient, {
      snapshot: snap,
      reason: 'MUTATION_RECONCILIATION',
      includeEquipment: false,
      fetchedAt: Date.now(),
    });

    patchPxCacheAfterReopenBox(queryClient, RECEPTION_ID, {
      box_id: BOX_ID,
      status: 'en_captura',
      version: 4,
    });

    const entry = queryClient.getQueryData<PxSnapshotCacheEntry>(pxReceptionQueryKey(RECEPTION_ID));
    expect(entry?.snapshot.boxes[0]?.status).toBe('en_captura');
    expect(entry?.snapshot.boxes[0]?.version).toBe(4);
  });

  it('ingestPxSnapshotToCache establece SSOT en query', () => {
    ingestPxSnapshotToCache(queryClient, RECEPTION_ID, buildSnapshot(9), 'RESUME', true);
    const entry = queryClient.getQueryData<PxSnapshotCacheEntry>(pxReceptionQueryKey(RECEPTION_ID));
    expect(entry?.snapshot.reception.version).toBe(9);
    expect(entry?.includeEquipment).toBe(true);
  });
});
