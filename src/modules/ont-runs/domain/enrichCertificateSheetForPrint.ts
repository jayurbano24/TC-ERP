import type { OntRun } from './types';
import {
  certSheetStr,
  parseCertParamRows,
  parseCertPhysicalRows,
  resolveCertSheetProfile,
  type CertSheetParamRow,
} from './certificateSheetRows';
import { buildOntRunThroughputSummary } from './ontRunThroughputSummary';
import { resolveOntRunBrandModel } from './resolveOntRunBrandModel';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type CpeRow = CertSheetParamRow;

function cpeRow(
  section: string,
  name: string,
  read: unknown,
  expected = '—',
  state = 'LECTURA'
): CpeRow | null {
  const v = certSheetStr(read);
  if (!v) return null;
  return { section, name, read: v, expected, state };
}

function stateFromVerdict(verdict: string): string {
  const v = verdict.trim().toLowerCase();
  if (['pass', 'cumple', 'sí', 'si', 'ok', 'cumple'].includes(v)) return 'CUMPLE';
  if (['fail', 'no', 'reprobado'].includes(v)) return 'NO';
  return 'LECTURA';
}

function rowKey(r: CpeRow): string {
  return `${r.section}\0${r.name}`.toLowerCase();
}

function mergeCpeRows(base: CpeRow[], extra: CpeRow[]): CpeRow[] {
  const seen = new Set(base.map(rowKey));
  const out = [...base];
  for (const r of extra) {
    const k = rowKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function qosFromFlows(flows: unknown[]): {
  avgMbps: number | null;
  passLinks: number;
  totalLinks: number;
  jitter: string;
  packetLoss: string;
} {
  let passLinks = 0;
  let mbpsSum = 0;
  let mbpsN = 0;
  let jitter = '';
  let packetLoss = '';
  for (const raw of flows) {
    if (!isPlainObject(raw)) continue;
    const verdict = certSheetStr(raw.verdict).toUpperCase();
    if (verdict === 'PASS') passLinks += 1;
    const avg = raw.mbps_avg != null ? Number(raw.mbps_avg) : NaN;
    if (!Number.isNaN(avg)) {
      mbpsSum += avg;
      mbpsN += 1;
    }
    if (!jitter && raw.jitter_ms != null) jitter = `${Number(raw.jitter_ms).toFixed(2)} ms`;
    if (!jitter && certSheetStr(raw.jitter)) jitter = certSheetStr(raw.jitter);
    if (!packetLoss && raw.packet_loss_pct != null) {
      packetLoss = `${Number(raw.packet_loss_pct).toFixed(2)} %`;
    }
    if (!packetLoss && certSheetStr(raw.packet_loss)) packetLoss = certSheetStr(raw.packet_loss);
  }
  return {
    avgMbps: mbpsN > 0 ? mbpsSum / mbpsN : null,
    passLinks,
    totalLinks: flows.length,
    jitter,
    packetLoss,
  };
}

function buildShortStamp(report: Record<string, unknown>, run: OntRun): string {
  const direct = certSheetStr(report.short_stamp);
  if (direct) return direct;
  const flows = Array.isArray(report.flows) ? report.flows : [];
  const qos = qosFromFlows(flows);
  const parts: string[] = [];
  const v = certSheetStr(report.global_verdict || run.verdict).toUpperCase();
  if (v) parts.push(v);
  if (qos.totalLinks > 0) {
    parts.push(`${qos.passLinks}/${qos.totalLinks} enlaces`);
  }
  if (qos.avgMbps != null) parts.push(`avg ${qos.avgMbps.toFixed(2)} Mbps`);
  const threshold = certSheetStr(report.speed_profile) || certSheetStr(report.profile);
  if (threshold) parts.push(`umbral ${threshold}`);
  return parts.join(' · ');
}

/** Filas alineadas al certificado LAB (IDENTIFICACIÓN · WI-FI · QOS · ÓPTICA GPON). */
export function collectCpeRowsFromRun(run: OntRun): CpeRow[] {
  const report = run.reportJson;
  if (!report || !isPlainObject(report)) return [];

  const dut = isPlainObject(report.dut) ? report.dut : {};
  const { brand, model } = resolveOntRunBrandModel(run);
  const rows: CpeRow[] = [];
  const push = (r: CpeRow | null) => {
    if (r) rows.push(r);
  };

  push(cpeRow('IDENTIFICACIÓN', 'Marca / Modelo', `${brand} ${model}`.trim() || dut.model || run.model));
  push(cpeRow('IDENTIFICACIÓN', 'Tecnología', run.kind || report.dut_profile || 'GPON'));
  push(cpeRow('IDENTIFICACIÓN', 'SN', dut.serial || run.serial));
  push(cpeRow('IDENTIFICACIÓN', 'MAC', dut.mac || run.mac));
  push(cpeRow('IDENTIFICACIÓN', 'IP gestión', dut.mgmt_ip || dut.ip || dut.management_ip));
  push(cpeRow('IDENTIFICACIÓN', 'Firmware', dut.firmware || run.softwareVersion));
  push(cpeRow('IDENTIFICACIÓN', 'Hardware', dut.hardware || run.hardwareVersion));

  push(cpeRow('WI-FI', 'SSID 2.4 GHz', dut.ssid_24 || run.ssid24));
  push(cpeRow('WI-FI', 'SSID 5 GHz', dut.ssid_50 || run.ssid50));
  push(cpeRow('WI-FI', 'Clave 2.4 GHz', dut.wifi_password_24 || run.wifiPassword24));
  push(cpeRow('WI-FI', 'Clave 5 GHz', dut.wifi_password_50 || run.wifiPassword50));

  const flows = Array.isArray(report.flows) ? report.flows : [];
  const qos = qosFromFlows(flows);
  if (qos.avgMbps != null) {
    push(
      cpeRow(
        'QOS',
        'Throughput',
        `${qos.avgMbps.toFixed(2)} Mbps`,
        certSheetStr(report.speed_profile) || '≥ 900 Mbps',
        qos.passLinks === qos.totalLinks && qos.totalLinks > 0 ? 'CUMPLE' : 'LECTURA'
      )
    );
  }
  if (qos.jitter) push(cpeRow('QOS', 'Jitter', qos.jitter));
  if (qos.packetLoss) push(cpeRow('QOS', 'Packet Loss', qos.packetLoss));

  for (const item of buildOntRunThroughputSummary(run)) {
    if (item.readMbps === '—' && item.passed === null) continue;
    push(
      cpeRow(
        'QOS',
        item.label,
        item.readMbps !== '—' ? `${item.readMbps} Mbps` : item.verdict,
        item.expected,
        item.passed === true ? 'CUMPLE' : item.passed === false ? 'NO' : stateFromVerdict(item.verdict)
      )
    );
  }

  for (const raw of run.throughput) {
    push(
      cpeRow(
        'QOS',
        raw.kind || `${raw.source} → ${raw.destination}`,
        raw.mbps != null ? `${raw.mbps.toFixed(2)} Mbps` : '—',
        '—',
        stateFromVerdict(raw.verdict)
      )
    );
  }

  push(cpeRow('ÓPTICA GPON', 'Potencia TX', dut.optical_tx || run.txOpticalPower));
  push(cpeRow('ÓPTICA GPON', 'Potencia RX', dut.optical_rx || run.rxOpticalPower));
  push(cpeRow('ÓPTICA GPON', 'Corriente bias', dut.optical_bias || run.biasCurrent));
  push(cpeRow('ÓPTICA GPON', 'Temperatura', dut.optical_temperature || run.workingTemperature));
  push(cpeRow('ÓPTICA GPON', 'Voltaje', dut.optical_voltage || run.workingVoltage));
  push(cpeRow('ÓPTICA GPON', 'Estado LOS', dut.los_status));
  push(cpeRow('ÓPTICA GPON', 'Enlace óptico', dut.optic_link));
  push(cpeRow('ÓPTICA GPON', 'Modo PON', dut.pon_mode));
  push(cpeRow('ÓPTICA GPON', 'Distancia', dut.optic_distance));

  return rows;
}

/** Filas EMTA/DOCSIS (certificate_sheet.rows) desde dut + columnas planas. */
export function collectEmtaRowsFromRun(run: OntRun): CpeRow[] {
  const report = run.reportJson;
  if (!report || !isPlainObject(report)) return [];

  const dut = isPlainObject(report.dut) ? report.dut : {};
  const { brand, model } = resolveOntRunBrandModel(run);
  const rows: CpeRow[] = [];
  const push = (r: CpeRow | null) => {
    if (r) rows.push(r);
  };

  push(cpeRow('IDENTIFICACIÓN', 'Marca / Modelo', `${brand} ${model}`.trim() || dut.model || run.model));
  push(cpeRow('IDENTIFICACIÓN', 'Tecnología', run.kind || dut.dut_profile || 'DOCSIS'));
  push(cpeRow('IDENTIFICACIÓN', 'SN', dut.serial || run.serial));
  push(cpeRow('IDENTIFICACIÓN', 'MAC', dut.mac || run.mac));
  push(cpeRow('IDENTIFICACIÓN', 'Firmware', dut.firmware || run.softwareVersion));
  push(cpeRow('IDENTIFICACIÓN', 'Hardware', dut.hardware || run.hardwareVersion));

  push(cpeRow('DOCSIS', 'Estado DOCSIS', dut.docsis_status));
  push(cpeRow('DOCSIS', 'Canales DS', dut.ds_channels));
  push(cpeRow('DOCSIS', 'Canales US', dut.us_channels));
  push(cpeRow('DOCSIS', 'Potencia DS', dut.ds_power));
  push(cpeRow('DOCSIS', 'Potencia US', dut.us_power));

  push(cpeRow('WLAN', 'Estado WLAN', dut.wlan_status || run.wlanStatus));
  push(cpeRow('WLAN', 'Canales', dut.wlan_channel || run.wlanChannel));
  push(cpeRow('WLAN', 'SSID 2.4 GHz', dut.ssid_24 || run.ssid24));
  push(cpeRow('WLAN', 'SSID 5 GHz', dut.ssid_50 || run.ssid50));
  push(cpeRow('WLAN', 'Clave 2.4 GHz', dut.wifi_password_24 || run.wifiPassword24));
  push(cpeRow('WLAN', 'Clave 5 GHz', dut.wifi_password_50 || run.wifiPassword50));

  const flows = Array.isArray(report.flows) ? report.flows : [];
  const qos = qosFromFlows(flows);
  if (qos.avgMbps != null) {
    push(
      cpeRow(
        'RENDIMIENTO',
        'Throughput medio',
        `${qos.avgMbps.toFixed(2)} Mbps`,
        certSheetStr(report.speed_profile) || 'Perfil estación',
        qos.passLinks === qos.totalLinks && qos.totalLinks > 0 ? 'CUMPLE' : 'LECTURA'
      )
    );
  }
  if (qos.jitter) push(cpeRow('RENDIMIENTO', 'Jitter', qos.jitter));
  if (qos.packetLoss) push(cpeRow('RENDIMIENTO', 'Packet Loss', qos.packetLoss));

  for (const raw of run.throughput) {
    push(
      cpeRow(
        'RENDIMIENTO',
        raw.kind || `${raw.source} → ${raw.destination}`,
        raw.mbps != null ? `${raw.mbps.toFixed(2)} Mbps` : '—',
        '—',
        stateFromVerdict(raw.verdict)
      )
    );
  }

  return rows;
}

function firstNonEmptyArray(...candidates: unknown[]): unknown[] | undefined {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return undefined;
}

function physicalRowsFromPorts(report: Record<string, unknown>) {
  const ports = report.ports;
  if (!Array.isArray(ports)) return [];
  return ports
    .filter(isPlainObject)
    .map((port) => {
      const name = certSheetStr(port.logical_name) || certSheetStr(port.name);
      if (!name) return null;
      const rx = port.rx_mbps != null ? Number(port.rx_mbps) : null;
      const read =
        rx != null && !Number.isNaN(rx)
          ? `${rx.toFixed(2)} Mbps RX`
          : certSheetStr(port.iperf_state) || certSheetStr(port.verdict);
      const state = certSheetStr(port.physical_verdict) || certSheetStr(port.verdict) || '—';
      return { name, read, expected: 'Perfil estación', state };
    })
    .filter((r): r is { name: string; read: string; expected: string; state: string } => r != null);
}

/**
 * Normaliza report_json para impresión: siempre diseño certificate_sheet (LAB-002),
 * completando cpe_rows / physical_rows desde dut, flows, ports y columnas planas.
 */
export function prepareRunForCertificatePrint(run: OntRun): OntRun {
  const report = run.reportJson;
  if (!report || !isPlainObject(report)) return run;

  const existing = isPlainObject(report.certificate_sheet) ? report.certificate_sheet : {};
  const profile = resolveCertSheetProfile(run, existing);

  const existingParam =
    profile === 'ont'
      ? [
          ...parseCertParamRows(existing.cpe_rows),
          ...parseCertParamRows(existing.rows),
        ]
      : parseCertParamRows(existing.rows);

  const enrichRows =
    profile === 'emta' ? collectEmtaRowsFromRun(run) : collectCpeRowsFromRun(run);
  const mergedParams = mergeCpeRows(existingParam, enrichRows);

  const physicalExisting = parseCertPhysicalRows(existing.physical_rows);
  const physicalPorts = physicalRowsFromPorts(report);
  const physicalMerged = [...physicalExisting];
  for (const p of physicalPorts) {
    if (!physicalMerged.some((x) => x.name === p.name)) physicalMerged.push(p);
  }

  const approved =
    existing.approved === true ||
    String(report.global_verdict || run.verdict).toUpperCase() === 'PASS';

  const dut = isPlainObject(report.dut) ? report.dut : {};
  const dsRows = firstNonEmptyArray(existing.ds_rows, dut.ds_rows, report.ds_rows);
  const usRows = firstNonEmptyArray(existing.us_rows, dut.us_rows, report.us_rows);

  const sheet: Record<string, unknown> = {
    ...existing,
    ont: profile === 'ont',
    emta: profile === 'emta',
    order: certSheetStr(existing.order) || run.runId,
    serial: certSheetStr(existing.serial) || run.serial,
    long_date:
      certSheetStr(existing.long_date) ||
      new Date(run.recordedAt).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'medium' }),
    headline_cpe:
      certSheetStr(existing.headline_cpe) ||
      certSheetStr(existing.headline) ||
      (approved ? 'CERTIFICADO' : 'NO CERTIFICADO'),
    approved,
    stamp: certSheetStr(existing.stamp) || (approved ? 'OK!' : '—'),
    short_stamp: certSheetStr(existing.short_stamp) || buildShortStamp(report, run),
    summary: certSheetStr(existing.summary) || certSheetStr(report.summary),
    optical_chart: existing.optical_chart ?? report.optical_chart,
    physical_rows: physicalMerged.length > 0 ? physicalMerged : existing.physical_rows,
    ...(profile === 'emta' && dsRows ? { ds_rows: dsRows } : {}),
    ...(profile === 'emta' && usRows ? { us_rows: usRows } : {}),
    ...(profile === 'emta' && !existing.rf_chart && report.rf_chart ? { rf_chart: report.rf_chart } : {}),
  };

  if (profile === 'ont') {
    sheet.cpe_rows = mergedParams;
  } else {
    sheet.rows = mergedParams;
  }

  if (mergedParams.length === 0 && physicalMerged.length === 0) {
    return run;
  }

  return {
    ...run,
    reportJson: {
      ...report,
      certificate_sheet: sheet,
    },
  };
}
