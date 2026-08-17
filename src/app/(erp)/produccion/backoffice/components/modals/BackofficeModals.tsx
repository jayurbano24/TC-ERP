'use client';

import React from 'react';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';
import { AgencyPickerModal } from './AgencyPickerModal';
import { BulkSeriesModal } from './BulkSeriesModal';
import { EditMetaModal, type EditMetaForm } from './EditMetaModal';
import { HistoryDetailModal } from './HistoryDetailModal';
import { MassTransferModal, type MassTransferForm } from './MassTransferModal';
import { MassTransferScanModal } from './MassTransferScanModal';
import { ReceptionDetailDrawer } from './ReceptionDetailDrawer';
import { TimelineModal } from './TimelineModal';

type Props = {
  showAgencyModal: boolean;
  agencySearch: string;
  agencies: CatalogAgency[];
  onAgencySearchChange: (value: string) => void;
  onSelectAgency: (id: string) => void;
  onCloseAgencyModal: () => void;
  agencyModalTitle?: string;
  agencyModalSubtitle?: string;
  showBulkModal: boolean;
  bulkText: string;
  onBulkTextChange: (value: string) => void;
  onBulkImport: () => void;
  onCloseBulkModal: () => void;
  selectedHistoryReception: Record<string, unknown> | null;
  historyModalSeries: unknown[];
  onCloseHistoryDetail: () => void;
  onPrintHistoryDetail: () => void;
  editMetaRec: Record<string, unknown> | null;
  editMeta: EditMetaForm;
  editMetaSaving: boolean;
  technologies: CatalogTech[];
  catalogBrands: CatalogBrand[];
  models: CatalogModel[];
  onEditMetaChange: (patch: Partial<EditMetaForm>) => void;
  onSaveEditMeta: () => void;
  onCloseEditMeta: () => void;
  showTimeline: Record<string, unknown> | null;
  timelineLoading?: boolean;
  timelineActiveGuide: string | null;
  onTimelineActiveGuideChange: (guide: string | null) => void;
  onCloseTimeline: () => void;
  selectedReception: Record<string, unknown> | null;
  selectedReceptionSeries: unknown[];
  isLoadingSeries: boolean;
  onCloseReceptionDrawer: () => void;
  showMassTransferModal: boolean;
  massTransferData: MassTransferForm;
  massTransferBrands: CatalogBrand[];
  onMassTransferDataChange: (patch: Partial<MassTransferForm>) => void;
  onPrepareMassTransfer: () => void;
  onCloseMassTransferModal: () => void;
  isScanningForTransfer: boolean;
  scannedTransferSeries: string[];
  currentScanInput: string;
  massTransferLoading: boolean;
  onScanInputChange: (value: string) => void;
  onScanKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onConfirmMassTransfer: () => void;
  onCloseScanModal: () => void;
};

export function BackofficeModals({
  showAgencyModal,
  agencySearch,
  agencies,
  onAgencySearchChange,
  onSelectAgency,
  onCloseAgencyModal,
  agencyModalTitle,
  agencyModalSubtitle,
  showBulkModal,
  bulkText,
  onBulkTextChange,
  onBulkImport,
  onCloseBulkModal,
  selectedHistoryReception,
  historyModalSeries,
  onCloseHistoryDetail,
  onPrintHistoryDetail,
  editMetaRec,
  editMeta,
  editMetaSaving,
  technologies,
  catalogBrands,
  models,
  onEditMetaChange,
  onSaveEditMeta,
  onCloseEditMeta,
  showTimeline,
  timelineLoading = false,
  timelineActiveGuide,
  onTimelineActiveGuideChange,
  onCloseTimeline,
  selectedReception,
  selectedReceptionSeries,
  isLoadingSeries,
  onCloseReceptionDrawer,
  showMassTransferModal,
  massTransferData,
  massTransferBrands,
  onMassTransferDataChange,
  onPrepareMassTransfer,
  onCloseMassTransferModal,
  isScanningForTransfer,
  scannedTransferSeries,
  currentScanInput,
  massTransferLoading,
  onScanInputChange,
  onScanKeyDown,
  onConfirmMassTransfer,
  onCloseScanModal,
}: Props) {
  return (
    <>
      <AgencyPickerModal
        open={showAgencyModal}
        agencies={agencies}
        search={agencySearch}
        onSearchChange={onAgencySearchChange}
        onSelect={onSelectAgency}
        onClose={onCloseAgencyModal}
        title={agencyModalTitle}
        subtitle={agencyModalSubtitle}
      />

      <BulkSeriesModal
        open={showBulkModal}
        bulkText={bulkText}
        onBulkTextChange={onBulkTextChange}
        onImport={onBulkImport}
        onClose={onCloseBulkModal}
      />

      {selectedHistoryReception && (
        <HistoryDetailModal
          reception={selectedHistoryReception}
          series={historyModalSeries}
          agencies={agencies}
          technologies={technologies}
          brands={catalogBrands}
          models={models}
          onPrint={onPrintHistoryDetail}
          onClose={onCloseHistoryDetail}
        />
      )}

      {editMetaRec && (
        <EditMetaModal
          reception={editMetaRec}
          editMeta={editMeta}
          saving={editMetaSaving}
          agencies={agencies}
          technologies={technologies}
          brands={catalogBrands}
          models={models}
          onEditMetaChange={onEditMetaChange}
          onSave={onSaveEditMeta}
          onClose={onCloseEditMeta}
        />
      )}

      {showTimeline && (
        <TimelineModal
          reception={showTimeline}
          activeGuide={timelineActiveGuide}
          agencies={agencies}
          loading={timelineLoading}
          onActiveGuideChange={onTimelineActiveGuideChange}
          onClose={onCloseTimeline}
        />
      )}

      {selectedReception && (
        <ReceptionDetailDrawer
          reception={selectedReception}
          series={selectedReceptionSeries}
          loading={isLoadingSeries}
          agencies={agencies}
          onClose={onCloseReceptionDrawer}
        />
      )}

      <MassTransferModal
        open={showMassTransferModal}
        data={massTransferData}
        technologies={technologies}
        brands={massTransferBrands}
        models={models}
        onDataChange={onMassTransferDataChange}
        onPrepare={onPrepareMassTransfer}
        onClose={onCloseMassTransferModal}
      />

      <MassTransferScanModal
        open={isScanningForTransfer}
        data={massTransferData}
        scannedSeries={scannedTransferSeries}
        scanInput={currentScanInput}
        loading={massTransferLoading}
        onScanInputChange={onScanInputChange}
        onScanKeyDown={onScanKeyDown}
        onConfirm={onConfirmMassTransfer}
        onClose={onCloseScanModal}
      />
    </>
  );
}
