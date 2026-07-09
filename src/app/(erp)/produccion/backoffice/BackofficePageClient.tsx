'use client';

import { ModulePage } from '@/components/module-page';
import { BackofficeTabNav } from './components/BackofficeTabNav';
import { HistoryTab } from './components/history/HistoryTab';
import { BackofficeModals } from './components/modals/BackofficeModals';
import { OperationTab } from './components/operation/OperationTab';
import { SubBodegaTab } from './components/SubBodegaTab';
import { useBackofficeOperation } from './hooks/useBackofficeOperation';
import type { BackofficeReception } from './types';

export default function BackofficePageClient() {
  const bo = useBackofficeOperation();
  const {
    activeTab,
    setActiveTab,
    operationCtx,
    historyLoadError,
    historyLoading,
    historyStatsLoading,
    historyStats,
    totalCount,
    totalPages,
    historySearch,
    setHistorySearch,
    historyFilters,
    historyFiltersOpen,
    setHistoryFiltersOpen,
    historyPage,
    setHistoryPage,
    fetchHistory,
    getHistoryTrayEntries,
    getUnfilteredHistoryTrayEntries,
    historyFilterBrands,
    historyFilterModels,
    patchHistoryFilter,
    clearHistoryFilters,
    dateFilterFrom,
    dateFilterTo,
    setDateFilterFrom,
    setDateFilterTo,
    CAC_AGENCIES,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    canReturnToPending,
    handleExportReport,
    handleSapBlockReturn,
    handleReturnToPending,
    handlePrintConduce,
    allReceptions,
    setAllReceptions,
    fetchPending,
    startProcessingReception,
    setSelectedAgencyId,
    showAgencyModal,
    agencySearch,
    setAgencySearch,
    setShowAgencyModal,
    showBulkModal,
    bulkText,
    setBulkText,
    handleBulkImport,
    onCloseBulkModal,
    selectedHistoryReception,
    historyModalSeries,
    onCloseHistoryDetail,
    onPrintHistoryDetail,
    editMetaRec,
    editMeta,
    editMetaSaving,
    handleOpenEditMeta,
    onEditMetaChange,
    handleSaveEditMeta,
    onCloseEditMeta,
    showTimeline,
    timelineActiveGuide,
    onShowTimeline,
    onTimelineActiveGuideChange,
    onCloseTimeline,
    selectedReception,
    selectedReceptionSeries,
    isLoadingSeries,
    handleViewReception,
    onCloseReceptionDrawer,
    showMassTransferModal,
    massTransferData,
    onMassTransferDataChange,
    massTransferBrands,
    handlePrepareMassTransfer,
    onCloseMassTransferModal,
    onOpenMassTransfer,
    isScanningForTransfer,
    scannedTransferSeries,
    currentScanInput,
    massTransferLoading,
    onScanInputChange,
    handleScanKeyDown,
    handleConfirmMassTransfer,
    onCloseScanModal,
    onCloseAgencyModal,
    handleOpenHistoryModal,
  } = bo;

  const onSelectAgency = (id: string) => {
    setSelectedAgencyId(id);
    const agency = CAC_AGENCIES.find((a) => a.id === id);
    operationCtx.setAgencia(agency?.name || '');
    setShowAgencyModal(false);
  };

  return (
    <ModulePage
      title="Recepción de Carga (CAC)"
      category="Logística"
      actions={
        <div className="flex bg-[var(--surface-hover)] p-1.5 rounded-2xl border border-[var(--border)]">
          <button
            type="button"
            className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
          >
            MÓDULO PX
          </button>
          <button
            type="button"
            className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
          >
            MÓDULO CAC
          </button>
        </div>
      }
    >
      <BackofficeTabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'op' && <OperationTab ctx={operationCtx} />}

      {activeTab === 'history' && (
        <HistoryTab
          historyLoadError={historyLoadError}
          historyLoading={historyLoading}
          historyStatsLoading={historyStatsLoading}
          historyStats={historyStats}
          totalCount={totalCount}
          totalPages={totalPages}
          historySearch={historySearch}
          setHistorySearch={setHistorySearch}
          historyFilters={historyFilters}
          historyFiltersOpen={historyFiltersOpen}
          setHistoryFiltersOpen={setHistoryFiltersOpen}
          historyPage={historyPage}
          setHistoryPage={setHistoryPage}
          fetchHistory={fetchHistory}
          getHistoryTrayEntries={getHistoryTrayEntries}
          historyFilterBrands={historyFilterBrands}
          historyFilterModels={historyFilterModels}
          patchHistoryFilter={patchHistoryFilter}
          clearHistoryFilters={clearHistoryFilters}
          dateFilterFrom={dateFilterFrom}
          dateFilterTo={dateFilterTo}
          setDateFilterFrom={setDateFilterFrom}
          setDateFilterTo={setDateFilterTo}
          CAC_AGENCIES={CAC_AGENCIES}
          MASTER_TECNOLOGIAS={MASTER_TECNOLOGIAS}
          MASTER_MARCAS={MASTER_MARCAS}
          MASTER_MODELOS={MASTER_MODELOS}
          canReturnToPending={canReturnToPending}
          onExportReport={handleExportReport}
          onOpenMassTransfer={onOpenMassTransfer}
          onSapBlockReturn={handleSapBlockReturn}
          onReturnToPending={handleReturnToPending}
          onShowTimeline={(rec) => onShowTimeline(rec as Record<string, unknown>)}
          onOpenHistoryModal={(rec) => void handleOpenHistoryModal(rec as Record<string, unknown>)}
          onOpenEditMeta={(rec) => handleOpenEditMeta(rec as Record<string, unknown>)}
          onPrintConduce={(rec) => handlePrintConduce(rec as BackofficeReception)}
        />
      )}

      {(activeTab === 'sub_accesorios' || activeTab === 'sub_telefonos') && (
        <SubBodegaTab
          activeTab={activeTab}
          allReceptions={allReceptions}
          setAllReceptions={setAllReceptions}
          dateFilterFrom={dateFilterFrom}
          dateFilterTo={dateFilterTo}
          setDateFilterFrom={setDateFilterFrom}
          setDateFilterTo={setDateFilterTo}
          CAC_AGENCIES={CAC_AGENCIES}
          fetchPending={fetchPending}
          onViewReception={(reception) => void handleViewReception(reception as unknown as Record<string, unknown>)}
          onReclassify={(reception) => {
            startProcessingReception(reception as BackofficeReception);
            setActiveTab('op');
          }}
        />
      )}

      <BackofficeModals
        showAgencyModal={showAgencyModal}
        agencySearch={agencySearch}
        agencies={CAC_AGENCIES}
        onAgencySearchChange={setAgencySearch}
        onSelectAgency={onSelectAgency}
        onCloseAgencyModal={onCloseAgencyModal}
        showBulkModal={showBulkModal}
        bulkText={bulkText}
        onBulkTextChange={setBulkText}
        onBulkImport={handleBulkImport}
        onCloseBulkModal={onCloseBulkModal}
        selectedHistoryReception={selectedHistoryReception}
        historyModalSeries={historyModalSeries}
        onCloseHistoryDetail={onCloseHistoryDetail}
        onPrintHistoryDetail={onPrintHistoryDetail}
        editMetaRec={editMetaRec}
        editMeta={editMeta}
        editMetaSaving={editMetaSaving}
        technologies={MASTER_TECNOLOGIAS}
        catalogBrands={MASTER_MARCAS}
        models={MASTER_MODELOS}
        onEditMetaChange={onEditMetaChange}
        onSaveEditMeta={handleSaveEditMeta}
        onCloseEditMeta={onCloseEditMeta}
        showTimeline={showTimeline}
        timelineActiveGuide={timelineActiveGuide}
        onTimelineActiveGuideChange={onTimelineActiveGuideChange}
        onCloseTimeline={onCloseTimeline}
        selectedReception={selectedReception}
        selectedReceptionSeries={selectedReceptionSeries}
        isLoadingSeries={isLoadingSeries}
        onCloseReceptionDrawer={onCloseReceptionDrawer}
        showMassTransferModal={showMassTransferModal}
        massTransferData={massTransferData}
        massTransferBrands={massTransferBrands}
        onMassTransferDataChange={onMassTransferDataChange}
        onPrepareMassTransfer={handlePrepareMassTransfer}
        onCloseMassTransferModal={onCloseMassTransferModal}
        isScanningForTransfer={isScanningForTransfer}
        scannedTransferSeries={scannedTransferSeries}
        currentScanInput={currentScanInput}
        massTransferLoading={massTransferLoading}
        onScanInputChange={onScanInputChange}
        onScanKeyDown={handleScanKeyDown}
        onConfirmMassTransfer={handleConfirmMassTransfer}
        onCloseScanModal={onCloseScanModal}
      />
    </ModulePage>
  );
}
