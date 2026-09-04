import { getPxBoxesDefault } from '@/shared/constants/batchLimits';
import type { GuideData } from '@/app/(erp)/recepcion/types/reception.types';

export type PxLotInput = {
  technologyName?: string;
  brandId?: string | null;
  modelId?: string | null;
  brandName?: string;
  modelName?: string;
  expectedUnits: number;
  material?: string;
};

/**
 * Las cajas eliminadas conservan su código (baja lógica) y el cliente propone el
 * correlativo contando solo cajas visibles, así que puede repetir uno dado de baja.
 * UNIQUE (reception_id, box_code) lo rechazaría y el operador quedaría bloqueado,
 * por eso el servidor corre el correlativo al primer hueco realmente libre.
 */
export function nextFreePxBoxCode(takenCodes: readonly string[], requestedCode: string): string {
  const taken = new Set(takenCodes.map((code) => String(code ?? '').toUpperCase()));
  const requested = requestedCode.toUpperCase();
  if (!taken.has(requested)) return requestedCode;

  const match = requested.match(/^(.*?)(\d+)$/);
  const prefix = match ? match[1] : `${requested}-`;

  let next = 0;
  for (const code of taken) {
    if (!code.startsWith(prefix)) continue;
    const suffix = Number.parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(suffix) && suffix > next) next = suffix;
  }

  do {
    next += 1;
  } while (taken.has(`${prefix}${next}`));

  return `${prefix}${next}`;
}

export type PxEquipmentRow = {
  id: string;
  main_serial: string;
  serial_s2: string | null;
  serial_s3: string | null;
  serial_s4: string | null;
  material: string | null;
  captured_at: string;
};

export type PxRejectedSerialScan = {
  id: string;
  serial_number: string;
  error_code: 'DUPLICATE_OPEN_OS';
  existing_os_id: string | null;
  existing_os_number: string | null;
  existing_os_status: string | null;
  existing_source: string | null;
  created_at: string;
};

export type PxBoxSnapshot = {
  id: string;
  box_code: string;
  status: string;
  declared_quantity: number;
  declared_quantity_original?: number | null;
  captured_count: number;
  rejected_count: number;
  brand_id: string | null;
  model_id: string | null;
  version: number;
  locked_by?: string | null;
  lock_expires_at?: string | null;
  assigned_operator_id?: string | null;
  is_partial_box?: boolean;
  partial_box_reason?: string | null;
  quantity_adjustment_reason?: string | null;
  lots: Array<{
    id: string;
    technology_name: string | null;
    brand_name: string | null;
    model_name: string | null;
    expected_units: number;
    brand_id: string | null;
    model_id: string | null;
  }>;
  equipment: PxEquipmentRow[];
  rejections: PxRejectedSerialScan[];
};

export type PxReceptionSnapshot = {
  reception: {
    id: string;
    guide_number: string;
    status: string;
    sap_document: string | null;
    carrier: string | null;
    notes: string | null;
    expected_units: number | null;
    expected_units_sap: number | null;
    received_units: number | null;
    variance_units: number | null;
    variance_reason: string | null;
    version: number;
    created_at: string;
  };
  boxes: PxBoxSnapshot[];
  total_captured: number;
};

export type PxReceptionSyncStamp = { version: number; fingerprint: string };

function pxFingerprintParts(parts: {
  version: number;
  receivedUnits: number;
  status: string;
  boxCount: number;
  boxVersionSum: number;
  activeEquip: number;
}): string {
  return [
    parts.version,
    parts.receivedUnits,
    parts.status,
    parts.boxCount,
    parts.boxVersionSum,
    parts.activeEquip,
  ].join('|');
}

export function pxFingerprintFromSnapshot(snap: PxReceptionSnapshot): string {
  return pxFingerprintParts({
    version: snap.reception.version ?? 1,
    receivedUnits: snap.reception.received_units ?? 0,
    status: snap.reception.status ?? '',
    boxCount: snap.boxes.length,
    boxVersionSum: snap.boxes.reduce((acc, b) => acc + (b.version ?? 1), 0),
    activeEquip: snap.total_captured ?? 0,
  });
}

export function snapshotToPxUiState(
  snapshot: PxReceptionSnapshot,
  options?: { hydrateScannedSeries?: boolean }
): {
  manifestItems: Array<{
    id: string;
    boxCode: string;
    tecnologia: string;
    marca: string;
    modelo: string;
    totalEsperado: number;
    material?: string;
  }>;
  scannedSeries: Array<{
    boxCode: string;
    sn: string;
    s2?: string;
    s3?: string;
    s4?: string;
    material?: string;
    equipmentId?: string;
  }>;
  closedBoxes: string[];
  boxIdByCode: Record<string, string>;
  boxVersionByCode: Record<string, number>;
  boxMetaByCode: Record<string, PxBoxSnapshot>;
} {
  const manifestItems: ReturnType<typeof snapshotToPxUiState>['manifestItems'] = [];
  const scannedSeries: ReturnType<typeof snapshotToPxUiState>['scannedSeries'] = [];
  const closedBoxes: string[] = [];
  const boxIdByCode: Record<string, string> = {};
  const boxVersionByCode: Record<string, number> = {};
  const boxMetaByCode: Record<string, PxBoxSnapshot> = {};

  for (const box of snapshot.boxes) {
    boxIdByCode[box.box_code] = box.id;
    boxVersionByCode[box.box_code] = box.version ?? 1;
    boxMetaByCode[box.box_code] = box;
    if (box.status === 'cerrada' || box.status === 'closed') {
      closedBoxes.push(box.box_code);
    }
    for (const lot of box.lots) {
      manifestItems.push({
        id: lot.id,
        boxCode: box.box_code,
        tecnologia: lot.technology_name || '',
        marca: lot.brand_name || '',
        modelo: lot.model_name || '',
        totalEsperado: lot.expected_units,
      });
    }
    for (const eq of box.equipment) {
      if (!options?.hydrateScannedSeries) continue;
      scannedSeries.push({
        boxCode: box.box_code,
        sn: eq.main_serial,
        s2: eq.serial_s2 || undefined,
        s3: eq.serial_s3 || undefined,
        s4: eq.serial_s4 || undefined,
        material: eq.material || undefined,
        equipmentId: eq.id,
      });
    }
  }

  return { manifestItems, scannedSeries, closedBoxes, boxIdByCode, boxVersionByCode, boxMetaByCode };
}

export function snapshotToGuideData(snapshot: PxReceptionSnapshot): Partial<GuideData> {
  const notes = snapshot.reception.notes || '';
  const docMatch = notes.match(/^DOC Ref:\s*(.+)$/m);
  const pilotoMatch = notes.match(/^Piloto:\s*(.+)$/m);
  const courierMatch = notes.match(/^Courier:\s*(.+)$/m);
  return {
    sap: snapshot.reception.sap_document || '',
    docReferencia: docMatch?.[1]?.trim() === '---' ? '' : docMatch?.[1]?.trim() || '',
    proveedorPx: snapshot.reception.carrier || '',
    guia: snapshot.reception.guide_number,
    piloto: pilotoMatch?.[1]?.trim() === '---' ? '' : pilotoMatch?.[1]?.trim() || '',
    courier: courierMatch?.[1]?.trim() === '---' ? '' : courierMatch?.[1]?.trim() || '',
    totalCajasEsperadas: snapshot.reception.expected_units_sap || getPxBoxesDefault(),
  };
}

/** Exportado para getPxReceptionSyncStamp (servidor). */
export function buildPxReceptionFingerprint(parts: {
  version: number;
  receivedUnits: number;
  status: string;
  boxCount: number;
  boxVersionSum: number;
  activeEquip: number;
}): string {
  return pxFingerprintParts(parts);
}
