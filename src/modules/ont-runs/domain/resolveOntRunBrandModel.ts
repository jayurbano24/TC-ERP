import type { OntRun } from './types';

function str(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

const GENERIC_DEVICE_TYPE =
  /^(ONT|EMTA|CPE|GPON|PON|DOCSIS(\s*\d+(\.\d+)*)?|CABLE\s*MODEM|CM)$/i;

function isGenericDeviceType(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return GENERIC_DEVICE_TYPE.test(v);
}

function inferBrandFromModel(model: string): string {
  const m = model.toUpperCase();
  if (/^HG|^EG|^HN|^HS|^MA56|^SmartAX/i.test(model)) return 'Huawei';
  if (/^F670|^F660|^ZX|^ZTE/i.test(model)) return 'ZTE';
  if (/^G-|^G010|^G140|^G240|^G-240|^Nokia/i.test(model)) return 'Nokia';
  if (/^CG-|^CHITA|^Hitron/i.test(model)) return 'Hitron';
  if (/^TC|^Arris|^Motorola|^MB/i.test(model)) return 'Arris/Motorola';
  return '';
}

function inferBrandFromKind(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes('huawei')) return 'Huawei';
  if (k.includes('zte')) return 'ZTE';
  if (k.includes('nokia')) return 'Nokia';
  if (k.includes('hitron')) return 'Hitron';
  if (k.includes('arris') || k.includes('motorola')) return 'Arris/Motorola';
  return '';
}

export type OntRunBrandModel = {
  brand: string;
  model: string;
};

/** Marca y modelo para UI — prioriza report_json.dut, luego columnas ont_runs. */
export function resolveOntRunBrandModel(run: OntRun): OntRunBrandModel {
  const dut =
    run.reportJson && typeof run.reportJson.dut === 'object' && run.reportJson.dut !== null
      ? (run.reportJson.dut as Record<string, unknown>)
      : null;

  let brand =
    str(dut?.brand) ||
    str(dut?.vendor) ||
    str(dut?.manufacturer) ||
    str(dut?.make) ||
    str(dut?.optic_vendor);

  let model = str(dut?.model) || str(run.model);

  const deviceType = str(run.deviceType);
  if (!model && deviceType && !isGenericDeviceType(deviceType)) {
    model = deviceType;
  }

  if (!brand) {
    brand = inferBrandFromModel(model) || inferBrandFromKind(run.kind);
  }

  if (!model && deviceType && !isGenericDeviceType(deviceType)) {
    model = deviceType;
  }

  return {
    brand: brand || '—',
    model: model || '—',
  };
}
