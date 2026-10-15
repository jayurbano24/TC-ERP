import { describe, expect, it } from 'vitest';
import { collectCpeRowsFromRun, prepareRunForCertificatePrint } from './enrichCertificateSheetForPrint';
import type { OntRun } from './types';

const baseRun: OntRun = {
  id: '1',
  runId: 'LAB-005-TC-0032',
  kind: 'GPON',
  station: 'LAB-005',
  operator: '2',
  verdict: 'PASS',
  model: 'HG8145X6-10',
  deviceType: 'ONT',
  serial: '485754432AEB98B0',
  mac: 'fc:12:2c:dc:9a:c9',
  softwareVersion: 'V5R022',
  hardwareVersion: '2C6D.A',
  txOpticalPower: '2.1 dBm',
  rxOpticalPower: '-18 dBm',
  workingVoltage: '',
  biasCurrent: '',
  workingTemperature: '',
  wlanStatus: '',
  wlanChannel: '',
  ssid24: '',
  ssid50: '',
  wifiPassword24: '',
  wifiPassword50: '',
  throughput: [],
  recordedAt: '2026-10-14T18:08:14.804Z',
  reportJson: {
    title: 'PERFIL ONT',
    global_verdict: 'PASS',
    station: 'LAB-005',
    dut: { serial: '485754432AEB98B0', model: 'HG8145X6-10' },
    flows: [{ case_id: '1', kind: 'lan', verdict: 'PASS', mbps_avg: 940, jitter_ms: 0.09, packet_loss_pct: 0 }],
  },
};

describe('prepareRunForCertificatePrint', () => {
  it('genera certificate_sheet con secciones IDENTIFICACIÓN / QOS / ÓPTICA', () => {
    const rows = collectCpeRowsFromRun(baseRun);
    expect(rows.some((r) => r.section === 'IDENTIFICACIÓN')).toBe(true);
    expect(rows.some((r) => r.section === 'QOS' && r.name === 'Throughput')).toBe(true);
    expect(rows.some((r) => r.section === 'ÓPTICA GPON')).toBe(true);

    const prepared = prepareRunForCertificatePrint(baseRun);
    const sheet = prepared.reportJson?.certificate_sheet as Record<string, unknown>;
    expect(Array.isArray(sheet.cpe_rows)).toBe(true);
    expect((sheet.cpe_rows as unknown[]).length).toBeGreaterThan(5);
    expect(sheet.headline_cpe).toBe('CERTIFICADO');
  });

  it('EMTA enriquece DOCSIS desde dut cuando el sheet está vacío', () => {
    const emtaRun: OntRun = {
      ...baseRun,
      runId: 'LAB-005-TC-0010',
      kind: 'emta',
      deviceType: 'EMTA',
      model: 'CG-2200',
      serial: '',
      verdict: 'FAIL',
      reportJson: {
        global_verdict: 'FAIL',
        station: 'LAB-005',
        dut: {
          model: 'CG-2200',
          docsis_status: 'Operational',
          ds_power: '-2 dBmV',
          ds_rows: [{ channel: 1, frequency_mhz: 573, power_dbmv: -2 }],
        },
      },
    };
    const prepared = prepareRunForCertificatePrint(emtaRun);
    const sheet = prepared.reportJson?.certificate_sheet as Record<string, unknown>;
    const rows = sheet.rows as { section: string; name: string }[];
    expect(rows.some((r) => r.section === 'DOCSIS')).toBe(true);
    expect(Array.isArray(sheet.ds_rows)).toBe(true);
    expect((sheet.ds_rows as unknown[]).length).toBe(1);
  });
});
