export type OntRunThroughput = {
  kind: string;
  mbps: number | null;
  source: string;
  verdict: string;
  destination: string;
};

export type OntRunReportJson = Record<string, unknown>;

export type OntRun = {
  /** PK Supabase cuando existe (uuid); run_id puede duplicarse. */
  id: string;
  runId: string;
  kind: string;
  station: string;
  operator: string;
  verdict: string;
  model: string;
  deviceType: string;
  serial: string;
  mac: string;
  softwareVersion: string;
  hardwareVersion: string;
  txOpticalPower: string;
  rxOpticalPower: string;
  workingVoltage: string;
  biasCurrent: string;
  workingTemperature: string;
  wlanStatus: string;
  wlanChannel: string;
  ssid24: string;
  ssid50: string;
  wifiPassword24: string;
  wifiPassword50: string;
  throughput: OntRunThroughput[];
  recordedAt: string;
  /** Payload completo del certificador (fuente de verdad para PDF). */
  reportJson: OntRunReportJson | null;
};

export type OntRunsListFilters = {
  q?: string;
  from?: string;
  to?: string;
  allData?: boolean;
  verdict?: string;
  /** Oculta corridas del certificador sin prueba completa (veredicto NOT_RUN). */
  hideNotRun?: boolean;
  deviceType?: string;
  station?: string;
  page?: number;
  limit?: number;
};

export type OntRunsDailyCertifiedPoint = {
  date: string;
  pass: number;
  fail: number;
  certified: number;
};

export type OntRunsVerdictSummary = {
  total: number;
  pass: number;
  fail: number;
  notRun: number;
  todayPass: number;
  todayFail: number;
  todayCertified: number;
  /** Últimos 7 días (calendario local), certificadas PASS+FAIL por día. */
  daily: OntRunsDailyCertifiedPoint[];
};

export type OntRunsListResponse = {
  rows: OntRun[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: OntRunsVerdictSummary;
  /** Filas duplicadas colapsadas en esta página (sync Supabase). */
  duplicateSuppressed?: number;
};
