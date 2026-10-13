import type { OntRun, OntRunThroughput } from '../domain/types';

type DbThroughput = {
  kind?: string;
  mbps?: number | null;
  source?: string;
  verdict?: string;
  destination?: string;
};

type DbOntRunRow = {
  id?: string | number | null;
  run_id: string;
  kind?: string | null;
  report_json?: Record<string, unknown> | null;
  station: string | null;
  operator: string | null;
  verdict: string | null;
  model: string | null;
  device_type: string | null;
  serial: string | null;
  mac: string | null;
  software_version: string | null;
  hardware_version: string | null;
  tx_optical_power: string | null;
  rx_optical_power: string | null;
  working_voltage: string | null;
  bias_current: string | null;
  working_temperature: string | null;
  wlan_status: string | null;
  wlan_channel: string | null;
  ssid_24: string | null;
  ssid_50: string | null;
  wifi_password_24: string | null;
  wifi_password_50: string | null;
  throughput: DbThroughput[] | null;
  recorded_at: string;
};

function str(value: string | null | undefined): string {
  return value == null ? '' : String(value);
}

function mapThroughput(raw: DbThroughput): OntRunThroughput {
  return {
    kind: str(raw.kind),
    mbps: typeof raw.mbps === 'number' ? raw.mbps : raw.mbps == null ? null : Number(raw.mbps),
    source: str(raw.source),
    verdict: str(raw.verdict),
    destination: str(raw.destination),
  };
}

export function mapOntRunRow(row: DbOntRunRow): OntRun {
  const throughput = Array.isArray(row.throughput) ? row.throughput.map(mapThroughput) : [];
  const reportJson =
    row.report_json && typeof row.report_json === 'object' && !Array.isArray(row.report_json)
      ? row.report_json
      : null;

  const idRaw = row.id;
  const id =
    idRaw == null || idRaw === ''
      ? ''
      : typeof idRaw === 'string'
        ? idRaw.trim()
        : String(idRaw);

  return {
    id,
    runId: str(row.run_id),
    kind: str(row.kind),
    station: str(row.station),
    operator: str(row.operator),
    verdict: str(row.verdict),
    model: str(row.model),
    deviceType: str(row.device_type),
    serial: str(row.serial),
    mac: str(row.mac),
    softwareVersion: str(row.software_version),
    hardwareVersion: str(row.hardware_version),
    txOpticalPower: str(row.tx_optical_power),
    rxOpticalPower: str(row.rx_optical_power),
    workingVoltage: str(row.working_voltage),
    biasCurrent: str(row.bias_current),
    workingTemperature: str(row.working_temperature),
    wlanStatus: str(row.wlan_status),
    wlanChannel: str(row.wlan_channel),
    ssid24: str(row.ssid_24),
    ssid50: str(row.ssid_50),
    wifiPassword24: str(row.wifi_password_24),
    wifiPassword50: str(row.wifi_password_50),
    throughput,
    recordedAt: row.recorded_at,
    reportJson,
  };
}
