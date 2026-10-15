import { describe, expect, it } from 'vitest';
import { renderCertifierReportHtml } from './certifierReportHtml';
import type { OntRun } from '../domain/types';

describe('renderCertifierReportHtml', () => {
  it('genera HTML certificate_sheet sin lanzar (LAB-005 mínimo)', () => {
    const run: OntRun = {
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
      },
    };
    const html = renderCertifierReportHtml(run);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('CERTIFICADO');
    expect(html).toContain('Parámetros');
    expect(html).not.toContain('Laboratorio de certificación');
  });
});
