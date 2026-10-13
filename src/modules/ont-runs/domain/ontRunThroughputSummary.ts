import type { OntRun } from './types';
import {
  certParamRowsFromSheet,
  certSheetStr,
  type CertSheetParamRow,
} from './certificateSheetRows';

export type ThroughputCheckItem = {
  key: string;
  label: string;
  readMbps: string;
  expected: string;
  passed: boolean | null;
  verdict: string;
};

const LAN_LABELS = ['LAN 1', 'LAN 2', 'LAN 3', 'LAN 4'] as const;
const WIFI_LABELS = ['Wi‑Fi 2.4 GHz', 'Wi‑Fi 5 GHz'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function verdictToPassFlag(verdict: string): boolean | null {
  const v = verdict.trim().toLowerCase();
  if (!v || v === '—' || v === '-' || v === 'n/a' || v === 'na' || v === 'skip' || v === 'not_run') {
    return null;
  }
  if (['pass', 'cumple', 'sí', 'si', 'ok', 'aprobado', 'yes'].includes(v)) return true;
  if (['fail', 'no', 'reprobado', 'failed'].includes(v)) return false;
  return null;
}

export function parseMbpsFromText(text: string): string {
  const t = text.trim();
  if (!t || t === '—') return '—';
  const m = t.match(/([\d.,]+)\s*mbps/i);
  if (m) return m[1].replace(',', '.');
  const n = Number(t.replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (!Number.isNaN(n) && t.match(/\d/)) return n.toFixed(2);
  return t;
}

function lanPortSortKey(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function isLanLikePortName(name: string): boolean {
  const n = name.toLowerCase();
  if (!n) return false;
  return (
    /^(lan|eth|ge|port|puerto|gigabit)\s*[-_]?\d/.test(n) ||
    /^p\s*\d+$/.test(n) ||
    n.includes('ethernet')
  );
}

function emptySlot(key: string, label: string): ThroughputCheckItem {
  return { key, label, readMbps: '—', expected: '—', passed: null, verdict: 'Sin prueba' };
}

function itemsFromPorts(reportJson: Record<string, unknown>): ThroughputCheckItem[] {
  const ports = reportJson.ports;
  if (!Array.isArray(ports)) return [];

  const candidates = ports
    .filter(isPlainObject)
    .map((port) => ({
      name: certSheetStr(port.logical_name) || certSheetStr(port.name),
      port,
    }))
    .filter(({ name }) => isLanLikePortName(name) || name.length > 0);

  const lanOrdered = candidates
    .filter(({ name }) => isLanLikePortName(name))
    .sort((a, b) => lanPortSortKey(a.name) - lanPortSortKey(b.name));

  const list =
    lanOrdered.length > 0
      ? lanOrdered.slice(0, 4)
      : candidates.slice(0, 4).map((c, i) => ({
          ...c,
          name: c.name || LAN_LABELS[i] || `Puerto ${i + 1}`,
        }));

  return list.map(({ name, port }, idx) => {
    const rx = port.rx_mbps != null ? Number(port.rx_mbps) : null;
    const tx = port.tx_mbps != null ? Number(port.tx_mbps) : null;
    const mbps = rx != null && !Number.isNaN(rx) ? rx : tx;
    const iperf = certSheetStr(port.iperf_state);
    const verdictRaw = certSheetStr(port.verdict) || iperf || '—';
    const passed = verdictToPassFlag(iperf) ?? verdictToPassFlag(certSheetStr(port.verdict));

    return {
      key: `lan-${idx}`,
      label: name || LAN_LABELS[idx] || `LAN ${idx + 1}`,
      readMbps: mbps != null && !Number.isNaN(mbps) ? mbps.toFixed(2) : '—',
      expected: '—',
      passed,
      verdict: verdictRaw,
    };
  });
}

function flowText(flow: Record<string, unknown>): string {
  return [flow.case_id, flow.kind, flow.source, flow.destination, flow.label, flow.name]
    .map((x) => certSheetStr(x).toLowerCase())
    .join(' ');
}

function pickWifiFlow(flows: unknown[], band: '24' | '50'): Record<string, unknown> | null {
  if (!Array.isArray(flows)) return null;
  for (const raw of flows) {
    if (!isPlainObject(raw)) continue;
    const blob = flowText(raw);
    if (band === '24') {
      if (/2\.4|2_4|24\s*ghz|wifi.?2|wlan.?2|band.?2/.test(blob)) return raw;
    } else if (/5\s*ghz|5\.0|wifi.?5|wlan.?5|band.?5/.test(blob) && !/2\.4|24\s*ghz/.test(blob)) {
      return raw;
    }
  }
  return null;
}

function itemsFromFlows(reportJson: Record<string, unknown>): ThroughputCheckItem[] {
  const flows = reportJson.flows;
  const flow24 = pickWifiFlow(flows as unknown[], '24');
  const flow50 = pickWifiFlow(flows as unknown[], '50');

  const mapFlow = (key: string, label: string, flow: Record<string, unknown> | null): ThroughputCheckItem => {
    if (!flow) return emptySlot(key, label);
    const avg = flow.mbps_avg != null ? Number(flow.mbps_avg) : null;
    const verdict = certSheetStr(flow.verdict) || '—';
    return {
      key,
      label,
      readMbps: avg != null && !Number.isNaN(avg) ? avg.toFixed(2) : '—',
      expected: '—',
      passed: verdictToPassFlag(verdict),
      verdict,
    };
  };

  return [
    mapFlow('wifi-24', WIFI_LABELS[0], flow24),
    mapFlow('wifi-50', WIFI_LABELS[1], flow50),
  ];
}

function certRowMatchesLabel(row: CertSheetParamRow, label: string): boolean {
  const n = row.name.toLowerCase();
  const s = row.section.toLowerCase();
  const blob = `${s} ${n}`;
  switch (label) {
    case 'LAN 1':
      return /lan\s*1|eth\s*1|puerto\s*1|port\s*1/.test(blob);
    case 'LAN 2':
      return /lan\s*2|eth\s*2|puerto\s*2|port\s*2/.test(blob);
    case 'LAN 3':
      return /lan\s*3|eth\s*3|puerto\s*3|port\s*3/.test(blob);
    case 'LAN 4':
      return /lan\s*4|eth\s*4|puerto\s*4|port\s*4/.test(blob);
    case 'Wi‑Fi 2.4 GHz':
      return /2\.4|24\s*ghz|wifi\s*2|wlan\s*2/.test(blob) && /throughput|tráfico|trafico|iperf|mbps/.test(blob);
    case 'Wi‑Fi 5 GHz':
      return (/5\s*ghz|5\.0|wifi\s*5|wlan\s*5/.test(blob) && !/2\.4/.test(blob)) &&
        /throughput|tráfico|trafico|iperf|mbps/.test(blob);
    default:
      return false;
  }
}

function mergeCertIntoItems(items: ThroughputCheckItem[], certRows: CertSheetParamRow[]): ThroughputCheckItem[] {
  return items.map((item) => {
    const row = certRows.find((r) => certRowMatchesLabel(r, item.label));
    if (!row) return item;
    return {
      ...item,
      readMbps: item.readMbps !== '—' ? item.readMbps : parseMbpsFromText(row.read),
      expected: row.expected !== '—' ? row.expected : item.expected,
      passed: item.passed ?? verdictToPassFlag(row.state),
      verdict: item.verdict !== '—' && item.verdict !== 'Sin prueba' ? item.verdict : row.state || item.verdict,
    };
  });
}

function itemsFromCertOnly(certRows: CertSheetParamRow[]): ThroughputCheckItem[] {
  const labels = [...LAN_LABELS, ...WIFI_LABELS];
  return labels.map((label) => {
    const row = certRows.find((r) => certRowMatchesLabel(r, label));
    if (!row) return emptySlot(label.toLowerCase().replace(/\s+/g, '-'), label);
    return {
      key: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      readMbps: parseMbpsFromText(row.read),
      expected: row.expected,
      passed: verdictToPassFlag(row.state),
      verdict: row.state,
    };
  });
}

function itemsFromFlatThroughput(run: OntRun): ThroughputCheckItem[] {
  if (run.throughput.length === 0) return [];
  return run.throughput.map((t, idx) => ({
    key: `flat-${idx}`,
    label: t.kind || t.source || `Flujo ${idx + 1}`,
    readMbps: t.mbps != null ? t.mbps.toFixed(2) : '—',
    expected: '—',
    passed: verdictToPassFlag(t.verdict),
    verdict: t.verdict || '—',
  }));
}

/** Resumen LAN 1–4 + Wi‑Fi 2.4 / 5 GHz para detalle de corrida. */
export function buildOntRunThroughputSummary(run: OntRun): ThroughputCheckItem[] {
  const reportJson =
    run.reportJson && typeof run.reportJson === 'object' && !Array.isArray(run.reportJson)
      ? run.reportJson
      : null;

  const certSheet =
    reportJson &&
    isPlainObject(reportJson.certificate_sheet) &&
    typeof reportJson.certificate_sheet === 'object'
      ? (reportJson.certificate_sheet as Record<string, unknown>)
      : null;

  const certRows = certSheet ? certParamRowsFromSheet(run, certSheet) : [];

  let lanItems: ThroughputCheckItem[] = reportJson ? itemsFromPorts(reportJson) : [];
  while (lanItems.length < 4) {
    const idx = lanItems.length;
    lanItems.push(emptySlot(`lan-${idx}`, LAN_LABELS[idx]));
  }
  lanItems = lanItems.slice(0, 4);

  let wifiItems = reportJson ? itemsFromFlows(reportJson) : [emptySlot('wifi-24', WIFI_LABELS[0]), emptySlot('wifi-50', WIFI_LABELS[1])];

  let merged = mergeCertIntoItems([...lanItems, ...wifiItems], certRows);

  const hasAnyData = merged.some((i) => i.readMbps !== '—' || i.passed !== null);
  if (!hasAnyData && certRows.length > 0) {
    merged = itemsFromCertOnly(certRows);
  }

  if (!merged.some((i) => i.readMbps !== '—' || i.passed !== null) && run.throughput.length > 0) {
    return itemsFromFlatThroughput(run);
  }

  return merged;
}

export function tallyThroughputPass(items: ThroughputCheckItem[]): { pass: number; fail: number; pending: number } {
  let pass = 0;
  let fail = 0;
  let pending = 0;
  for (const item of items) {
    if (item.passed === true) pass += 1;
    else if (item.passed === false) fail += 1;
    else pending += 1;
  }
  return { pass, fail, pending };
}
