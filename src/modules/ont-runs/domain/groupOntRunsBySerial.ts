import type { OntRun } from './types';
import { isNotRunVerdict } from './ontRunVerdict';
import { resolveOntRunBrandModel } from './resolveOntRunBrandModel';

export type OntRunRowEntry = {
  run: OntRun;
  rowKey: string;
};

export type OntRunListGroupKind = 'serial' | 'batch';

export type OntRunSerialGroup = {
  groupKind: OntRunListGroupKind;
  serialKey: string;
  serialLabel: string;
  entries: OntRunRowEntry[];
  brand: string;
  model: string;
  latestRecordedAt: string;
  passCount: number;
  failCount: number;
  notRunCount: number;
};

/** Serie vacía o basura de sync (coma, guion) → sin agrupar por valor falso. */
export function normalizeOntRunSerial(serial: string): string {
  const s = serial.trim();
  if (!s) return '';
  if (/^[,.\-_–—]+$/.test(s)) return '';
  if (s.length <= 2 && !/\d/.test(s)) return '';
  return s;
}

export function truncateToMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.trim().slice(0, 16);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

function compareRecordedAtDesc(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

/** Serie + minuto, o lote sync (sin serie + misma hora + estación). */
export function entryListGroupKey(run: OntRun): string {
  const serial = normalizeOntRunSerial(run.serial);
  const minute = truncateToMinute(run.recordedAt);
  const station = run.station.trim().toUpperCase() || '_';
  if (serial) return `serial:${serial.toUpperCase()}|${minute}`;
  return `batch:${minute}|${station}`;
}

function groupKindFromKey(key: string): OntRunListGroupKind {
  return key.startsWith('batch:') ? 'batch' : 'serial';
}

function groupLabelFor(key: string, labelRun: OntRun, entryCount: number): string {
  if (key.startsWith('batch:')) {
    return entryCount > 1 ? `Lote sync · ${entryCount} JOBs` : 'Sin serie';
  }
  const serial = normalizeOntRunSerial(labelRun.serial);
  return serial || 'Serie';
}

export function groupOntRunEntriesBySerial(entries: OntRunRowEntry[]): OntRunSerialGroup[] {
  const map = new Map<string, OntRunRowEntry[]>();

  for (const entry of entries) {
    const key = entryListGroupKey(entry.run);
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }

  const groups: OntRunSerialGroup[] = [];

  for (const [serialKey, groupEntries] of map) {
    const sorted = [...groupEntries].sort((a, b) =>
      compareRecordedAtDesc(a.run.recordedAt, b.run.recordedAt)
    );
    const latest = sorted[0]?.run;
    if (!latest) continue;

    let passCount = 0;
    let failCount = 0;
    let notRunCount = 0;
    for (const { run } of sorted) {
      const v = run.verdict.toUpperCase();
      if (v === 'PASS') passCount += 1;
      else if (v === 'FAIL') failCount += 1;
      else if (isNotRunVerdict(run.verdict)) notRunCount += 1;
    }

    const labelRun =
      sorted.find((e) => normalizeOntRunSerial(e.run.serial))?.run ?? latest;
    const { brand: groupBrand, model: groupModel } = resolveOntRunBrandModel(labelRun);

    groups.push({
      groupKind: groupKindFromKey(serialKey),
      serialKey,
      serialLabel: groupLabelFor(serialKey, labelRun, sorted.length),
      brand: groupBrand,
      model: groupModel,
      entries: sorted,
      latestRecordedAt: latest.recordedAt,
      passCount,
      failCount,
      notRunCount,
    });
  }

  groups.sort((a, b) => compareRecordedAtDesc(a.latestRecordedAt, b.latestRecordedAt));
  return groups;
}
