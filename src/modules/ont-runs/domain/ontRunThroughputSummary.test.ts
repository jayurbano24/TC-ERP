import { describe, expect, it } from 'vitest';
import { buildOntRunThroughputSummary, parseMbpsFromText, verdictToPassFlag } from './ontRunThroughputSummary';
import type { OntRun } from './types';

const baseRun = (): OntRun => ({
  id: '1',
  runId: 'TC-1',
  kind: 'ont',
  station: 'LAB',
  operator: 'op',
  verdict: 'PASS',
  model: 'HG',
  deviceType: 'ont',
  serial: 'SN',
  mac: 'mac',
  softwareVersion: '',
  hardwareVersion: '',
  txOpticalPower: '',
  rxOpticalPower: '',
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
  recordedAt: new Date().toISOString(),
  reportJson: null,
});

describe('verdictToPassFlag', () => {
  it('maps pass and fail', () => {
    expect(verdictToPassFlag('PASS')).toBe(true);
    expect(verdictToPassFlag('FAIL')).toBe(false);
    expect(verdictToPassFlag('N/A')).toBe(null);
  });
});

describe('parseMbpsFromText', () => {
  it('extracts Mbps from read column', () => {
    expect(parseMbpsFromText('941.63 Mbps')).toBe('941.63');
  });
});

describe('buildOntRunThroughputSummary', () => {
  it('reads four LAN ports and wifi flows from report_json', () => {
    const run = baseRun();
    run.reportJson = {
      ports: [
        { logical_name: 'LAN1', verdict: 'PASS', rx_mbps: 940, iperf_state: 'PASS' },
        { logical_name: 'LAN2', verdict: 'PASS', rx_mbps: 938, iperf_state: 'PASS' },
        { logical_name: 'LAN3', verdict: 'FAIL', rx_mbps: 100, iperf_state: 'FAIL' },
        { logical_name: 'LAN4', verdict: 'PASS', rx_mbps: 942, iperf_state: 'PASS' },
      ],
      flows: [
        { case_id: 'wifi-2.4', kind: 'wifi', mbps_avg: 320, verdict: 'PASS' },
        { case_id: 'wifi-5ghz', kind: 'wifi', mbps_avg: 880, verdict: 'PASS' },
      ],
    };
    const items = buildOntRunThroughputSummary(run);
    expect(items).toHaveLength(6);
    expect(items[0].label).toBe('LAN1');
    expect(items[0].passed).toBe(true);
    expect(items[2].passed).toBe(false);
    expect(items[4].label).toBe('Wi‑Fi 2.4 GHz');
    expect(items[4].readMbps).toBe('320.00');
    expect(items[5].readMbps).toBe('880.00');
  });
});
