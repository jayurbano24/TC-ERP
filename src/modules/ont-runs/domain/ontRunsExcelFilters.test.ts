import { describe, expect, it } from 'vitest';
import {
  EMPTY_ONT_RUN_EXCEL_FILTERS,
  filterOntRunEntriesByExcel,
  matchesOntRunExcelFilters,
  ontRunExcelCellValue,
} from './ontRunsExcelFilters';
import type { OntRun } from './types';

function run(partial: Partial<OntRun>): OntRun {
  return {
    id: '1',
    runId: 'TC-001',
    kind: 'cert',
    station: 'LAB-A',
    operator: 'op',
    verdict: 'PASS',
    model: 'HG8245',
    deviceType: 'ONT',
    serial: 'SN123',
    mac: '',
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
    recordedAt: '2026-03-01T10:00:00Z',
    reportJson: null,
    ...partial,
  };
}

describe('ontRunsExcelFilters', () => {
  it('filtra por veredicto', () => {
    const entries = [
      { run: run({ verdict: 'PASS' }), rowKey: 'a' },
      { run: run({ verdict: 'FAIL', runId: 'TC-002' }), rowKey: 'b' },
    ];
    const filters = { ...EMPTY_ONT_RUN_EXCEL_FILTERS, verdict: new Set(['PASS']) };
    expect(filterOntRunEntriesByExcel(entries, filters, null, null)).toHaveLength(1);
    expect(matchesOntRunExcelFilters(entries[0], filters)).toBe(true);
    expect(matchesOntRunExcelFilters(entries[1], filters)).toBe(false);
  });

  it('expone valor de celda para lab', () => {
    const entry = { run: run({ station: 'GT-01' }), rowKey: 'a' };
    expect(ontRunExcelCellValue(entry, 'lab')).toBe('GT-01');
  });
});
