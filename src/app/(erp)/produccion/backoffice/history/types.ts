import type { SapValidationState } from '@/lib/sap/sapValidationStatus';

export type HistoryUnitEntry = {
  rec: any;
  grp: { modelId: string; brandId: string; fullSeries: any[] };
  unit: any[];
  unitIndex: number;
  groupIndex: number;
  osLabel: string;
  unitGuide: string;
  unitAgencyRaw: string;
  unitSap: string;
  unitStatus: string;
  unitStatusLabel: string;
  sapTransferId: string | null;
  unitSapValidationStatus: SapValidationState;
  seriesSapStatuses: string[];
  sortAt: number;
  /** Fecha/hora real de clasificación en Backoffice (OS o serie) */
  classifiedAtIso: string;
  serviceOrderId?: string;
  techId?: string;
  prediagnostico?: {
    shellClass: string;
    verdict: string;
    notes: string;
    updatedByName: string;
    updatedAt: string;
  } | null;
};

export type HistoryTrayFilters = {
  guide: string;
  pilot: string;
  courier: string;
  receivedBy: string;
  status: string;
  osLabel: string;
  sapDocument: string;
  techId: string;
  brandId: string;
  modelId: string;
  agencyId: string;
  shellClass: string;
  verdict: string;
};

export const EMPTY_HISTORY_TRAY_FILTERS: HistoryTrayFilters = {
  guide: '',
  pilot: '',
  courier: '',
  receivedBy: '',
  status: '',
  osLabel: '',
  sapDocument: '',
  techId: '',
  brandId: '',
  modelId: '',
  agencyId: '',
  shellClass: '',
  verdict: '',
};
