'use client';

import type { OntRun } from '../domain/types';
import { resolveOntRunBrandModel } from '../domain/resolveOntRunBrandModel';

function flatThroughputSummary(run: OntRun): string {
  if (run.throughput.length === 0) return '';
  return run.throughput
    .map((t) => {
      const mbps = t.mbps != null ? `${t.mbps.toFixed(2)} Mbps` : '—';
      return `${t.kind} ${t.source}→${t.destination}: ${mbps} (${t.verdict})`;
    })
    .join(' | ');
}

export async function exportOntRunsExcel(runs: OntRun[], filenameSuffix: string): Promise<void> {
  const rows = runs.map((run) => {
    const { brand, model } = resolveOntRunBrandModel(run);
    const r = run.reportJson;
    const globalVerdict =
      r && typeof r === 'object' && typeof r.global_verdict === 'string' ? r.global_verdict : run.verdict;
    const title = r && typeof r === 'object' && typeof r.title === 'string' ? r.title : '';
    return {
      'Run ID': run.runId,
      Kind: run.kind,
      'Título certificación': title,
      Fecha: run.recordedAt,
      Veredicto: run.verdict,
      'Veredicto global': globalVerdict,
      Estación: run.station,
      Operador: run.operator,
      Marca: brand === '—' ? '' : brand,
      Modelo: model === '—' ? '' : model,
      'Tipo dispositivo': run.deviceType,
      Serie: run.serial,
      MAC: run.mac,
      Software: run.softwareVersion,
      Hardware: run.hardwareVersion,
      'TX óptico': run.txOpticalPower,
      'RX óptico': run.rxOpticalPower,
      Voltaje: run.workingVoltage,
      'Bias current': run.biasCurrent,
      Temperatura: run.workingTemperature,
      'WLAN status': run.wlanStatus,
      'WLAN channel': run.wlanChannel,
      'SSID 2.4G': run.ssid24,
      'SSID 5G': run.ssid50,
      'WiFi pass 2.4G': run.wifiPassword24,
      'WiFi pass 5G': run.wifiPassword50,
      Throughput: flatThroughputSummary(run),
      'Tiene report_json': run.reportJson ? 'Sí' : 'No',
    };
  });

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ont_runs');
  XLSX.writeFile(wb, `ont_runs_${filenameSuffix || 'export'}.xlsx`);
}
