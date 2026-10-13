'use client';

import { Printer } from 'lucide-react';
import { Button, Badge, Card } from '@/components/ui';
import type { OntRun } from '@/modules/ont-runs/domain/types';
import {
  certParamRowsFromSheet,
  certSheetStr,
  parseCertPhysicalRows,
  type CertSheetParamRow,
} from '@/modules/ont-runs/domain/certificateSheetRows';
import { isNotRunVerdict } from '@/modules/ont-runs/domain/ontRunVerdict';
import { resolveOntRunBrandModel } from '@/modules/ont-runs/domain/resolveOntRunBrandModel';
import { printOntRunReport } from '@/modules/ont-runs/client/printOntRunReport';
import {
  buildOntRunThroughputSummary,
  tallyThroughputPass,
  type ThroughputCheckItem,
} from '@/modules/ont-runs/domain/ontRunThroughputSummary';

type Props = {
  run: OntRun;
};

type ParamTally = {
  yes: number;
  no: number;
  na: number;
  total: number;
};

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const shown = value.trim() ? value : '—';
  return (
    <div className="min-w-0">
      <p className="text-[7px] font-black uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className={`text-[10px] font-bold text-[var(--foreground)] truncate ${mono ? 'font-mono' : ''}`} title={shown}>
        {shown}
      </p>
    </div>
  );
}

function formatRecordedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
}

function complyBadge(state: string) {
  const s = state.toLowerCase();
  if (s === 'sí' || s === 'si' || s === 'cumple' || s === 'pass') {
    return (
      <Badge variant="green" className="!px-1 !py-0 text-[7px] font-black uppercase">
        {state}
      </Badge>
    );
  }
  if (s === 'no' || s === 'fail' || s === 'reprobado') {
    return (
      <Badge variant="red" className="!px-1 !py-0 text-[7px] font-black uppercase">
        {state}
      </Badge>
    );
  }
  return (
    <Badge variant="slate" className="!px-1 !py-0 text-[7px] font-black uppercase">
      {state || '—'}
    </Badge>
  );
}

function tallyFromParamRows(rows: CertSheetParamRow[]): ParamTally {
  let yes = 0;
  let no = 0;
  let na = 0;
  for (const row of rows) {
    const s = row.state.toLowerCase();
    if (s === 'sí' || s === 'si' || s === 'cumple' || s === 'pass') yes += 1;
    else if (s === 'no' || s === 'fail' || s === 'reprobado') no += 1;
    else na += 1;
  }
  return { yes, no, na, total: rows.length };
}

function KpiChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'neutral' | 'pass' | 'fail' | 'warn' | 'info';
}) {
  const tones = {
    neutral: 'border-[var(--border)] bg-[var(--surface)]',
    pass: 'border-emerald-500/30 bg-emerald-500/10',
    fail: 'border-red-500/30 bg-red-500/10',
    warn: 'border-amber-500/30 bg-amber-500/10',
    info: 'border-[var(--accent)]/30 bg-[var(--accent)]/10',
  };
  const valueTone = {
    neutral: 'text-[var(--heading)]',
    pass: 'text-emerald-600',
    fail: 'text-red-600',
    warn: 'text-amber-700 dark:text-amber-300',
    info: 'text-[var(--accent)]',
  };
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 min-w-[72px] ${tones[tone]}`}>
      <p className="text-[7px] font-black uppercase text-[var(--muted)]">{label}</p>
      <p className={`text-base font-black leading-none mt-0.5 tabular-nums ${valueTone[tone]}`}>{value}</p>
    </div>
  );
}

function throughputPassBadge(item: ThroughputCheckItem) {
  if (item.passed === true) {
    return (
      <Badge variant="green" className="!px-1.5 !py-0 text-[7px] font-black uppercase">
        Pasa
      </Badge>
    );
  }
  if (item.passed === false) {
    return (
      <Badge variant="red" className="!px-1.5 !py-0 text-[7px] font-black uppercase">
        Falla
      </Badge>
    );
  }
  return (
    <Badge variant="slate" className="!px-1.5 !py-0 text-[7px] font-black uppercase">
      Sin dato
    </Badge>
  );
}

function ThroughputSummaryTable({ items }: { items: ThroughputCheckItem[] }) {
  const tally = tallyThroughputPass(items);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">
          Throughput · 4 LAN + Wi‑Fi 2.4 / 5 GHz
        </p>
        <p className="text-[8px] font-bold text-[var(--muted)] tabular-nums">
          OK {tally.pass} · Falla {tally.fail} · Pend. {tally.pending}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[520px] text-left text-[9px]">
          <thead className="bg-[var(--surface)] text-[var(--muted)] uppercase">
            <tr>
              <th className="px-2 py-1 font-black">Prueba</th>
              <th className="px-2 py-1 font-black text-right">Mbps medido</th>
              <th className="px-2 py-1 font-black">Esperado</th>
              <th className="px-2 py-1 font-black text-center">Resultado</th>
              <th className="px-2 py-1 font-black text-center">Veredicto</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="border-t border-[var(--border)]">
                <td className="px-2 py-1 font-bold">{item.label}</td>
                <td className="px-2 py-1 text-right font-mono font-black">{item.readMbps}</td>
                <td className="px-2 py-1 font-mono text-[var(--muted)]">{item.expected}</td>
                <td className="px-2 py-1 text-center">{throughputPassBadge(item)}</td>
                <td className="px-2 py-1 text-center text-[var(--muted)] font-bold uppercase">{item.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlowsDetailTable({ flows }: { flows: Record<string, unknown>[] }) {
  if (flows.length === 0) return null;
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1.5">
        Detalle iPerf / flujos ({flows.length})
      </p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] max-h-[200px] overflow-y-auto">
        <table className="w-full min-w-[640px] text-left text-[9px]">
          <thead className="bg-[var(--surface)] text-[var(--muted)] uppercase sticky top-0">
            <tr>
              <th className="px-2 py-1 font-black">Caso</th>
              <th className="px-2 py-1 font-black">Tipo</th>
              <th className="px-2 py-1 font-black">Ruta</th>
              <th className="px-2 py-1 font-black text-right">Avg Mbps</th>
              <th className="px-2 py-1 font-black text-center">Vered.</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow, idx) => (
              <tr key={String(flow.case_id || idx)} className="border-t border-[var(--border)]">
                <td className="px-2 py-0.5 font-mono">{String(flow.case_id || '—')}</td>
                <td className="px-2 py-0.5">{String(flow.kind || '—')}</td>
                <td className="px-2 py-0.5">
                  {String(flow.source || '—')} → {String(flow.destination || '—')}
                </td>
                <td className="px-2 py-0.5 text-right font-mono font-bold">
                  {flow.mbps_avg != null ? Number(flow.mbps_avg).toFixed(2) : '—'}
                </td>
                <td className="px-2 py-0.5 text-center">{String(flow.verdict || '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CertParamTable({ title, rows }: { title: string; rows: CertSheetParamRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1.5">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] max-h-[280px] overflow-y-auto">
        <table className="w-full min-w-[560px] text-left text-[9px]">
          <thead className="bg-[var(--surface)] text-[var(--muted)] uppercase sticky top-0 z-[1]">
            <tr>
              <th className="px-2 py-1 font-black">Sección</th>
              <th className="px-2 py-1 font-black">Parámetro</th>
              <th className="px-2 py-1 font-black">Leído</th>
              <th className="px-2 py-1 font-black">Esperado</th>
              <th className="px-2 py-1 font-black text-center w-16">Est.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.section}-${row.name}-${idx}`} className="border-t border-[var(--border)]">
                <td className="px-2 py-0.5 text-[var(--muted)] font-bold max-w-[80px] truncate">{row.section || '—'}</td>
                <td className="px-2 py-0.5 font-bold">{row.name}</td>
                <td className="px-2 py-0.5 font-mono">{row.read}</td>
                <td className="px-2 py-0.5 font-mono text-[var(--muted)]">{row.expected}</td>
                <td className="px-2 py-0.5 text-center">{complyBadge(row.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function reportMeta(run: OntRun): {
  title: string;
  globalVerdict: string;
  ports: number;
  flows: number;
  measurements: number;
} | null {
  const r = run.reportJson;
  if (!r || typeof r !== 'object') return null;
  const ports = Array.isArray(r.ports) ? r.ports.length : 0;
  const flows = Array.isArray(r.flows) ? r.flows.length : 0;
  const measurements = Array.isArray(r.measurements) ? r.measurements.length : 0;
  return {
    title: typeof r.title === 'string' ? r.title : 'Certificación de laboratorio',
    globalVerdict: typeof r.global_verdict === 'string' ? r.global_verdict : run.verdict,
    ports,
    flows,
    measurements,
  };
}

export function OntRunDetailPanel({ run }: Props) {
  const { brand, model } = resolveOntRunBrandModel(run);
  const meta = reportMeta(run);
  const dut =
    run.reportJson && typeof run.reportJson === 'object' && run.reportJson.dut && typeof run.reportJson.dut === 'object'
      ? (run.reportJson.dut as Record<string, unknown>)
      : null;

  const certSheet =
    run.reportJson && typeof run.reportJson === 'object' && run.reportJson.certificate_sheet &&
    typeof run.reportJson.certificate_sheet === 'object'
      ? (run.reportJson.certificate_sheet as Record<string, unknown>)
      : null;

  const paramRows = certSheet ? certParamRowsFromSheet(run, certSheet) : [];
  const physicalRows = certSheet ? parseCertPhysicalRows(certSheet.physical_rows) : [];
  const dsCount = certSheet && Array.isArray(certSheet.ds_rows) ? certSheet.ds_rows.length : 0;
  const usCount = certSheet && Array.isArray(certSheet.us_rows) ? certSheet.us_rows.length : 0;

  const orderLabel = certSheet ? certSheetStr(certSheet.order) : '';
  const headline = certSheet ? certSheetStr(certSheet.headline) : '';
  const tallyText = certSheet ? certSheetStr(certSheet.tally) : '';
  const paramTally = tallyFromParamRows(paramRows);
  const throughputSummary = buildOntRunThroughputSummary(run);
  const throughputTally = tallyThroughputPass(throughputSummary);
  const reportFlows =
    run.reportJson && Array.isArray(run.reportJson.flows)
      ? (run.reportJson.flows as Record<string, unknown>[])
      : [];

  const opticalRx = dut && typeof dut.optical_rx === 'string' ? dut.optical_rx : run.rxOpticalPower;
  const opticalTx = dut && typeof dut.optical_tx === 'string' ? dut.optical_tx : run.txOpticalPower;
  const opticalBias = dut && typeof dut.optical_bias === 'string' ? dut.optical_bias : run.biasCurrent;
  const opticalTemp =
    dut && typeof dut.optical_temperature === 'string' ? dut.optical_temperature : run.workingTemperature;
  const opticalVoltage =
    dut && typeof dut.optical_voltage === 'string' ? dut.optical_voltage : run.workingVoltage;
  const wifi24 = dut && typeof dut.wifi_password_24 === 'string' ? dut.wifi_password_24 : run.wifiPassword24;
  const wifi50 = dut && typeof dut.wifi_password_50 === 'string' ? dut.wifi_password_50 : run.wifiPassword50;

  const displayVerdict = meta?.globalVerdict || run.verdict;
  const headlineLabel = headline || meta?.title || '';

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface-hover)]/40 p-3 space-y-3">
      {/* Cabecera + acción */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
            ONT RUN · detalle certificado
          </p>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-base font-black font-mono text-[var(--heading)]">{run.runId}</h3>
            {headlineLabel ? (
              <span className="text-[10px] font-black uppercase text-[var(--muted)]">{headlineLabel}</span>
            ) : null}
          </div>
          {orderLabel && orderLabel !== run.runId ? (
            <p className="text-[9px] font-bold text-[var(--foreground)]">
              Orden lab: <span className="font-black">{orderLabel}</span>
            </p>
          ) : null}
          <p className="text-[9px] font-bold text-[var(--muted)]">
            {formatRecordedAt(run.recordedAt)} · {run.station || '—'} · {run.operator || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={displayVerdict.toUpperCase() === 'PASS' ? 'green' : displayVerdict.toUpperCase() === 'FAIL' ? 'red' : 'yellow'}
            className="text-[9px] font-black"
          >
            {displayVerdict || '—'}
          </Badge>
          <Button
            type="button"
            variant="primary"
            className="!h-8 !px-3 !text-[9px] !bg-[var(--accent)] !text-[var(--accent-foreground)]"
            leftIcon={<Printer className="h-3.5 w-3.5" />}
            onClick={() => printOntRunReport(run)}
          >
            PDF certificación
          </Button>
        </div>
      </div>

      {/* Identidad DUT */}
      <Card className="p-2.5 border border-[var(--border)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-2">
        <Field label="Marca" value={brand} />
        <Field label="Modelo" value={model} />
        <Field label="Serie DUT" value={run.serial} mono />
        <Field label="MAC" value={run.mac} mono />
        <Field label="Perfil" value={run.kind} />
        <Field label="Tipo" value={run.deviceType} />
      </Card>

      {/* Mini dashboard certificación */}
      {!isNotRunVerdict(run.verdict) && (paramTally.total > 0 || meta) ? (
        <div className="flex flex-wrap gap-2 items-stretch">
          {paramTally.total > 0 ? (
            <>
              <KpiChip label="Cumplen" value={paramTally.yes} tone="pass" />
              <KpiChip label="Fallan" value={paramTally.no} tone="fail" />
              <KpiChip label="Sin dato" value={paramTally.na} tone="neutral" />
            </>
          ) : null}
          <KpiChip label="Parámetros" value={paramRows.length} tone="info" />
          <KpiChip label="RF DS / US" value={`${dsCount}/${usCount}`} tone="neutral" />
          {meta ? (
            <>
              <KpiChip label="Puertos" value={meta.ports} tone="neutral" />
              <KpiChip label="Flujos" value={meta.flows} tone="neutral" />
            </>
          ) : null}
          {throughputTally.pass + throughputTally.fail > 0 ? (
            <KpiChip
              label="Throughput OK"
              value={`${throughputTally.pass}/${throughputTally.pass + throughputTally.fail}`}
              tone={throughputTally.fail > 0 ? 'fail' : 'pass'}
            />
          ) : null}
        </div>
      ) : null}

      {!isNotRunVerdict(run.verdict) ? (
        <ThroughputSummaryTable items={throughputSummary} />
      ) : null}

      {reportFlows.length > 0 ? <FlowsDetailTable flows={reportFlows} /> : null}

      {tallyText ? (
        <p className="text-[9px] font-mono font-bold text-[var(--muted)] px-1">{tallyText}</p>
      ) : null}

      {isNotRunVerdict(run.verdict) ? (
        <p className="text-[9px] font-bold text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-2.5 py-2">
          <strong>NOT_RUN</strong> — certificación incompleta. Ejecute de nuevo la prueba en el certificador para obtener
          parámetros y PDF válido.
        </p>
      ) : null}

      {!meta && !isNotRunVerdict(run.verdict) ? (
        <p className="text-[9px] font-bold text-[var(--muted)]">Sin report_json completo — PDF limitado.</p>
      ) : null}

      {certSheet && paramRows.length > 0 ? (
        <CertParamTable title={`Parámetros · leído vs esperado (${paramRows.length})`} rows={paramRows} />
      ) : certSheet && !isNotRunVerdict(run.verdict) ? (
        <p className="text-[9px] font-bold text-amber-700 dark:text-amber-400 rounded-lg border border-amber-200/80 px-2.5 py-2">
          Sin filas en certificate_sheet — use el PDF o una corrida con certificación completa.
        </p>
      ) : null}

      {physicalRows.length > 0 ? (
        <CertParamTable
          title={`Certificación física (${physicalRows.length})`}
          rows={physicalRows.map((r) => ({
            section: 'Física',
            name: r.name,
            read: r.read,
            expected: r.expected,
            state: r.state,
          }))}
        />
      ) : null}

      {certSheet && run.kind.toLowerCase().includes('emta') && dsCount === 0 && usCount === 0 ? (
        <p className="text-[9px] font-bold text-amber-700 dark:text-amber-400 px-1">
          Anexo RF sin canales DS/US — ver PDF o re-certificar con DOCSIS operacional.
        </p>
      ) : null}

      <div>
        <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1.5">
          Telemetría DUT
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <Field label="TX óptico" value={opticalTx} />
          <Field label="RX óptico" value={opticalRx} />
          <Field label="Voltaje" value={opticalVoltage} />
          <Field label="Bias" value={opticalBias} />
          <Field label="Temp." value={opticalTemp} />
          <Field label="WLAN" value={run.wlanStatus} />
          <Field label="Canal WiFi" value={run.wlanChannel} />
          <Field label="SSID 2.4G" value={run.ssid24} />
          <Field label="SSID 5G" value={run.ssid50} />
          <Field label="SW" value={run.softwareVersion} />
          <Field label="HW" value={run.hardwareVersion} />
          {dut && typeof dut.pon_mode === 'string' ? <Field label="PON" value={dut.pon_mode} /> : null}
          {dut && typeof dut.los_status === 'string' ? <Field label="LOS" value={dut.los_status} /> : null}
        </div>
      </div>

      {meta && meta.ports > 0 && Array.isArray(run.reportJson?.ports) && (
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1.5">
            Puertos ({meta.ports})
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-[9px]">
              <thead className="bg-[var(--surface)] text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-2 py-1 font-black">Puerto</th>
                  <th className="px-2 py-1 font-black">Vered.</th>
                  <th className="px-2 py-1 font-black text-right">RX Mbps</th>
                  <th className="px-2 py-1 font-black text-right">TX Mbps</th>
                  <th className="px-2 py-1 font-black text-center">iPerf</th>
                </tr>
              </thead>
              <tbody>
                {(run.reportJson.ports as Record<string, unknown>[]).map((port, idx) => (
                  <tr key={String(port.logical_name || idx)} className="border-t border-[var(--border)]">
                    <td className="px-2 py-0.5 font-bold">{String(port.logical_name || '—')}</td>
                    <td className="px-2 py-0.5">{String(port.verdict || '—')}</td>
                    <td className="px-2 py-0.5 text-right font-mono">
                      {port.rx_mbps != null ? Number(port.rx_mbps).toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-0.5 text-right font-mono">
                      {port.tx_mbps != null ? Number(port.tx_mbps).toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-0.5 text-center font-bold uppercase">
                      {String(port.iperf_state || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {run.throughput.length > 0 && (
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1.5">
            Throughput ({run.throughput.length})
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-[9px]">
              <thead className="bg-[var(--surface)] text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-2 py-1 font-black">Tipo</th>
                  <th className="px-2 py-1 font-black">Origen → Destino</th>
                  <th className="px-2 py-1 font-black text-right">Mbps</th>
                  <th className="px-2 py-1 font-black text-center">Vered.</th>
                </tr>
              </thead>
              <tbody>
                {run.throughput.map((row, idx) => (
                  <tr key={`${row.source}-${row.destination}-${idx}`} className="border-t border-[var(--border)]">
                    <td className="px-2 py-0.5 font-bold">{row.kind || '—'}</td>
                    <td className="px-2 py-0.5">
                      {row.source || '—'} → {row.destination || '—'}
                    </td>
                    <td className="px-2 py-0.5 text-right font-mono font-bold">
                      {row.mbps != null ? row.mbps.toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-0.5 text-center">{row.verdict || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[8px] text-[var(--muted)] mt-1 font-bold">
            Canales RF y gráficos completos en el PDF del certificador.
          </p>
        </div>
      )}
    </div>
  );
}
