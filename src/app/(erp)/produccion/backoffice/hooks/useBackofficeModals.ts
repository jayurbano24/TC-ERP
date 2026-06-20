'use client';

import type React from 'react';
import { useState } from 'react';
import type { CatalogAgency, CatalogBrand, CatalogModel, GuideItem } from '../types';
import { useBulkSeriesModal } from './modals/useBulkSeriesModal';
import { useEditMetaModal } from './modals/useEditMetaModal';
import { useHistoryDetailModals } from './modals/useHistoryDetailModals';
import { useMassTransferModal } from './modals/useMassTransferModal';

type Params = {
  CAC_AGENCIES: CatalogAgency[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  historyReceptions: unknown[];
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  resolveSeriesPerUnit: (modelId: string) => number;
  guideItems: GuideItem[];
  setGuideItems: React.Dispatch<React.SetStateAction<GuideItem[]>>;
};

export function useBackofficeModals({
  CAC_AGENCIES,
  MASTER_MARCAS,
  MASTER_MODELOS,
  historyReceptions,
  fetchHistory,
  resolveSeriesPerUnit,
  guideItems,
  setGuideItems,
}: Params) {
  const [showAgencyModal, setShowAgencyModal] = useState(false);
  const [agencySearch, setAgencySearch] = useState('');

  const bulk = useBulkSeriesModal({ guideItems, setGuideItems });
  const editMeta = useEditMetaModal({ CAC_AGENCIES, fetchHistory });
  const historyDetail = useHistoryDetailModals({ historyReceptions });
  const massTransfer = useMassTransferModal({
    MASTER_MARCAS,
    MASTER_MODELOS,
    historyReceptions,
    fetchHistory,
    resolveSeriesPerUnit,
  });

  return {
    showAgencyModal,
    setShowAgencyModal,
    agencySearch,
    setAgencySearch,
    onCloseAgencyModal: () => setShowAgencyModal(false),
    ...bulk,
    ...editMeta,
    ...historyDetail,
    ...massTransfer,
  };
}
