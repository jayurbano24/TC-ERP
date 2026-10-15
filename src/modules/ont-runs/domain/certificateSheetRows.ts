import type { OntRun } from './types';

export type CertSheetParamRow = {
  section: string;
  name: string;
  read: string;
  expected: string;
  state: string;
};

export type CertSheetPhysicalRow = {
  name: string;
  read: string;
  expected: string;
  state: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function certSheetStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function parseCertParamRows(raw: unknown): CertSheetParamRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map((r) => ({
      section: certSheetStr(r.section),
      name: certSheetStr(r.name),
      read: certSheetStr(r.read) || '—',
      expected: certSheetStr(r.expected) || '—',
      state: certSheetStr(r.state) || '—',
    }))
    .filter((r) => r.name);
}

export function parseCertPhysicalRows(raw: unknown): CertSheetPhysicalRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map((r) => ({
      name: certSheetStr(r.name),
      read: certSheetStr(r.read) || '—',
      expected: certSheetStr(r.expected) || '—',
      state: certSheetStr(r.state) || '—',
    }))
    .filter((r) => r.name);
}

export type CertSheetProfile = 'emta' | 'ont';

export function resolveCertSheetProfile(run: OntRun, sheet: Record<string, unknown>): CertSheetProfile {
  if (sheet.emta === true) return 'emta';
  if (sheet.ont === true) return 'ont';
  const kind = (run.kind || certSheetStr(sheet.dut_profile)).toLowerCase();
  if (kind.includes('emta') || kind.includes('docsis')) return 'emta';
  if (kind.includes('ont') || kind.includes('gpon')) return 'ont';
  const deviceType = (run.deviceType || '').toLowerCase();
  if (deviceType.includes('ont') || deviceType.includes('gpon') || /^hg|^eg|^f670/i.test(run.model || '')) {
    return 'ont';
  }
  if (Array.isArray(sheet.cpe_rows) && sheet.cpe_rows.length > 0) return 'ont';
  return 'emta';
}

export function certParamRowsFromSheet(
  run: OntRun,
  sheet: Record<string, unknown>
): CertSheetParamRow[] {
  const profile = resolveCertSheetProfile(run, sheet);
  if (profile === 'ont') {
    const cpe = parseCertParamRows(sheet.cpe_rows);
    if (cpe.length > 0) return cpe;
    return parseCertParamRows(sheet.rows);
  }
  return parseCertParamRows(sheet.rows);
}
