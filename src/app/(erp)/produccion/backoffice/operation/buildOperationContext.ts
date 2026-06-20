import type React from 'react';
import type { OperationContext } from './operationContext';
import type { BackofficeReception, CatalogAgency, CatalogBrand, CatalogModel, CatalogTech, ReceptionStep } from '../types';

type ManifestSlice = {
  guideItems: OperationContext['guideItems'];
  setGuideItems: OperationContext['setGuideItems'];
  manifestPanelOpen: OperationContext['manifestPanelOpen'];
  setManifestPanelOpen: OperationContext['setManifestPanelOpen'];
  sapTransferNumber: OperationContext['sapTransferNumber'];
  setSapTransferNumber: OperationContext['setSapTransferNumber'];
  sapGroups: OperationContext['sapGroups'];
  setSapGroups: OperationContext['setSapGroups'];
  activeSapGroupId: OperationContext['activeSapGroupId'];
  setActiveSapGroupId: OperationContext['setActiveSapGroupId'];
  newItem: OperationContext['newItem'];
  setNewItem: OperationContext['setNewItem'];
  selectedItemIdx: OperationContext['selectedItemIdx'];
  setSelectedItemIdx: OperationContext['setSelectedItemIdx'];
  itemSeriesInputs: OperationContext['itemSeriesInputs'];
  setItemSeriesInputs: OperationContext['setItemSeriesInputs'];
  availableBrandsConfig: OperationContext['availableBrandsConfig'];
  availableModels: OperationContext['availableModels'];
  isActiveSapDocumentFilled: OperationContext['isActiveSapDocumentFilled'];
  initSapGroupsForConfig: OperationContext['initSapGroupsForConfig'];
  addSapGroup: OperationContext['addSapGroup'];
  selectSapGroup: OperationContext['selectSapGroup'];
  removeSapGroup: OperationContext['removeSapGroup'];
  updateActiveSapDocument: OperationContext['updateActiveSapDocument'];
  addItem: OperationContext['addItem'];
};

type InboxSlice = {
  pendingReceptions: OperationContext['pendingReceptions'];
  inboxLoadError: OperationContext['inboxLoadError'];
  allReceptions: OperationContext['allReceptions'];
  fetchPending: OperationContext['fetchPending'];
  startProcessingReception: OperationContext['startProcessingReception'];
};

type ModalsSlice = {
  setShowAgencyModal: OperationContext['setShowAgencyModal'];
  setShowBulkModal: OperationContext['setShowBulkModal'];
  setBulkTargetIdx: OperationContext['setBulkTargetIdx'];
};

export type BuildOperationContextParams = {
  receptionStep: ReceptionStep;
  setReceptionStep: React.Dispatch<React.SetStateAction<ReceptionStep>>;
  activeReception: BackofficeReception | null;
  setActiveReception: React.Dispatch<React.SetStateAction<BackofficeReception | null>>;
  accessoryPhotos: string[];
  setAccessoryPhotos: React.Dispatch<React.SetStateAction<string[]>>;
  scannedGuides: string[];
  setScannedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  processedGuides: string[];
  setProcessedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  inboxSearch: string;
  setInboxSearch: React.Dispatch<React.SetStateAction<string>>;
  classificationSearch: string;
  setClassificationSearch: React.Dispatch<React.SetStateAction<string>>;
  agencia: string;
  setAgencia: React.Dispatch<React.SetStateAction<string>>;
  selectedAgencyId: string;
  setSelectedAgencyId: React.Dispatch<React.SetStateAction<string>>;
  category: 'Equipo' | 'Accesorio' | 'Teléfono';
  setCategory: React.Dispatch<React.SetStateAction<'Equipo' | 'Accesorio' | 'Teléfono'>>;
  returnReason: string;
  setReturnReason: React.Dispatch<React.SetStateAction<string>>;
  returnTracking: string;
  setReturnTracking: React.Dispatch<React.SetStateAction<string>>;
  returnCourier: string;
  setReturnCourier: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  isSubmitting: boolean;
  processingDateLabel: string;
  currentUserFullName: string;
  historyLoading: boolean;
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  agencyDetails: CatalogAgency | undefined;
  manifest: ManifestSlice;
  inbox: InboxSlice;
  modals: ModalsSlice;
  handlePrintConduce: OperationContext['handlePrintConduce'];
  fetchHistory: OperationContext['fetchHistory'];
  handleTestConnection: OperationContext['handleTestConnection'];
  handleUndoClassification: OperationContext['handleUndoClassification'];
  completeCurrentGuides: OperationContext['completeCurrentGuides'];
  handleConfirmReturn: OperationContext['handleConfirmReturn'];
  onCompletedNextBox: OperationContext['onCompletedNextBox'];
  compressImage: OperationContext['compressImage'];
};

export function buildOperationContext(params: BuildOperationContextParams): OperationContext {
  const { manifest, inbox, modals, ...rest } = params;
  return {
    ...rest,
    ...manifest,
    pendingReceptions: inbox.pendingReceptions,
    inboxLoadError: inbox.inboxLoadError,
    allReceptions: inbox.allReceptions,
    fetchPending: inbox.fetchPending,
    startProcessingReception: inbox.startProcessingReception,
    setShowAgencyModal: modals.setShowAgencyModal,
    setShowBulkModal: modals.setShowBulkModal,
    setBulkTargetIdx: modals.setBulkTargetIdx,
  };
}
