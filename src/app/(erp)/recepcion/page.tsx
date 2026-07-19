// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { ModulePage } from '@/components/module-page';
import { notify, confirmDialog } from '@/components/ui';
import { ReceptionHeader } from './components/ReceptionHeader';
import { PxReceptionTab } from './components/PxReceptionTab';
import { CacReceptionTab } from './components/CacReceptionTab';
import { HistoryTab } from './components/HistoryTab';

// Hooks
import { useReceptionPX } from './hooks/useReceptionPX';
import { useReceptionPXIncremental } from './hooks/useReceptionPXIncremental';
import { useReceptionCAC } from './hooks/useReceptionCAC';
import { useReceptionScanner } from './hooks/useReceptionScanner';
import { useReceptionValidation } from './hooks/useReceptionValidation';

import { receptionService } from './services/receptionService';
import { printingService } from './services/printingService';
import { receptionRepository } from './repositories/receptionRepository';
import {
  fetchPxPrintData,
  fetchCacGuideSerials,
} from './services/receptionReadsApi';
import { getCurrentReceptionActor } from '@/modules/recepcion/client/receptionActor';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Mapea una fila de `receptions` a la forma legacy que consumen las pestañas
// PX/CAC e Historial. Centralizado para evitar las 3 copias que existían.
function mapReceptionRow(row: any) {
  return {
    id: row.id,
    created_at: row.created_at,
    fecha_formateada: new Date(row.created_at).toLocaleString(),
    guide_number: row.guide_number,
    carrier: row.carrier || '---',
    usuario: row.received_by || 'SISTEMA',
    received_by: row.received_by || 'SISTEMA',
    received_units: row.received_units || 1,
    status: row.status || 'RECEPCIONADA',
    notes: row.notes || '',
    sap_document: row.sap_document || '---',
    sap_orden_servicio: row.id,
    tipo: row.source.toUpperCase(),
    pilot_display:
      row.notes?.split('Piloto: ')?.[1]?.split('\n')?.[0]?.trim() ||
      row.carrier ||
      'OPERADOR LOGÍSTICO',
    allGuias: row.processed_guides || [],
  };
}

export default function ReceptionsPage() {
  const [moduleMode, setModuleMode] = useState<'cac' | 'px'>('cac');
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [currentUserFullName, setCurrentUserFullName] = useState('OPERADOR_SISTEMA');

  // History Tab State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPilot, setFilterPilot] = useState('Todos');
  const [showTimeline, setShowTimeline] = useState<any | null>(null);
  const [timelineActiveGuide, setTimelineActiveGuide] = useState<string | null>(null);

  // Load PX State
  const pxState = useReceptionPX();
  
  // Load CAC State
  const cacState = useReceptionCAC();

  // C6: fuente única del historial de recepciones (caché + dedupe). Reemplaza
  // las 3 llamadas sueltas a getReceptions() que había en la página.
  const queryClient = useQueryClient();
  const receptionsQuery = useQuery({
    queryKey: ['receptions'],
    queryFn: () => receptionRepository.getHistory(),
  });

  // Cuando la query trae datos (carga inicial o invalidación), mapeamos a la
  // forma legacy que consumen las pestañas. Depende SOLO de los datos para no
  // entrar en bucle con los setters de pxState/cacState.
  useEffect(() => {
    const rows = receptionsQuery.data;
    if (!rows) return;
    const mappedPx: any[] = [];
    const mappedCac: any[] = [];
    for (const row of rows) {
      const legacyRec = mapReceptionRow(row);
      if (row.source === 'px') mappedPx.push(legacyRec);
      else mappedCac.push(legacyRec);
    }
    pxState.setPxRecords(mappedPx);
    cacState.setCacRecords(mappedCac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receptionsQuery.data]);

  useEffect(() => {
    getCurrentReceptionActor().then((actor) => {
      if (actor.fullName) setCurrentUserFullName(actor.fullName);
    });
  }, []);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'px' || mode === 'cac') setModuleMode(mode);
  }, []);

  // Load Scanner State
  const scannerState = useReceptionScanner();

  // Load Validation logic
  const validationState = useReceptionValidation();

  // --- SUBMIT LÓGICA (STRANGLER FIG) ---
  const handleFinalizeCAC = async () => {
    try {
      cacState.setCacError('');

      if (cacState.cacScannedItems.length === 0) {
        notify.warning('No hay guías escaneadas.');
        return;
      }

      const result = await receptionService.finalizeCACReception({
        cacScannedItems: cacState.cacScannedItems,
        cacCarrier: cacState.cacCarrier,
        cacPilot: cacState.cacPilot,
        cacAgency: cacState.cacAgency,
        cacTotalCajas: cacState.cacTotalCajas
      }, currentUserFullName);
      
      if (result && result.error) {
        throw new Error(result.error);
      }
      
      notify.success('Recepción CAC guardada', { description: 'Pendiente de clasificación en Backoffice.' });
      cacState.setCacScannedItems([]);
      scannerState.setIsIndustrialScanning(false);
      cacState.setCacPilot('');
      cacState.setCacCarrier('');
      cacState.setCacAgency('');
      cacState.setCacTotalCajas(0);

      // Recargar el historial silenciosamente (invalida la caché de la query).
      await refreshHistory();
    } catch (err: any) {
      cacState.setCacError(err.message || 'Error de conexión');
    }
  };

  const refreshHistory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['receptions'] });
  }, [queryClient]);

  // --- CONFIG STATE ---
  const [transportes, setTransportes] = useState<any[]>([]);
  const [systemTechnologies, setSystemTechnologies] = useState<any[]>([]);
  const [systemBrands, setSystemBrands] = useState<any[]>([]);
  const [systemModels, setSystemModels] = useState<any[]>([]);
  const [systemPxProviders, setSystemPxProviders] = useState<any[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<any[]>([]);
  const [filteredModels, setFilteredModels] = useState<any[]>([]);

  const pxIncremental = useReceptionPXIncremental({
    pxState,
    currentUserFullName,
    systemBrands,
    systemModels,
    onHistoryRefresh: refreshHistory,
  });

  const [isSubmittingPX, setIsSubmittingPX] = useState(false);

  const handleFinalizePX = async () => {
    if (isSubmittingPX) return;
    setIsSubmittingPX(true);
    try {
      await pxIncremental.handleFinalizePXIncremental();
    } finally {
      setIsSubmittingPX(false);
    }
  };

  const handleAddSN_PX = pxIncremental.onScanPxIncremental;

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [techs, brnds, mdls, pxProvs, carriers] = await Promise.all([
          receptionRepository.getTechnologies(),
          receptionRepository.getBrands(),
          receptionRepository.getModels(),
          receptionRepository.getPxProviders(),
          receptionRepository.getCarriers()
        ]);
        setSystemTechnologies(techs || []);
        setSystemBrands(brnds || []);
        setSystemModels(mdls || []);
        setSystemPxProviders(pxProvs || []);
        setTransportes(carriers || []);
        
        if (techs?.length > 0) pxState.setCurrentEntry(prev => ({ ...prev, tecnologia: techs[0].name }));
        if (brnds?.length > 0) pxState.setCurrentEntry(prev => ({ ...prev, marca: brnds[0].name }));
        if (mdls?.length > 0) pxState.setCurrentEntry(prev => ({ ...prev, modelo: mdls[0].name }));
        if (pxProvs?.length > 0) pxState.setGuideData(prev => ({ ...prev, proveedorPx: pxProvs[0].name }));
      } catch (err) {
        console.error('Error fetching config', err);
      }
    };
    fetchConfig();
    // El historial ahora lo carga receptionsQuery (TanStack Query) + el efecto
    // de mapeo de arriba; ya no se hace fetch manual aquí.
  }, []);

  useEffect(() => {
    setFilteredBrands(systemBrands);
  }, [systemBrands]);

  useEffect(() => {
    let filtered = systemModels;
    
    if (pxState.currentEntry.marca) {
      const brandId = systemBrands.find(b => b.name === pxState.currentEntry.marca)?.id;
      filtered = filtered.filter(m => m.brand_id === brandId);
    }
    
    if (pxState.currentEntry.tecnologia) {
      const techId = systemTechnologies.find(t => t.name === pxState.currentEntry.tecnologia)?.id;
      filtered = filtered.filter(m => m.technology_id === techId);
    }
    
    setFilteredModels(filtered);
  }, [pxState.currentEntry.marca, pxState.currentEntry.tecnologia, systemBrands, systemTechnologies, systemModels]);


  
  const handleAddCaja = () => {
    notify.info('En recepción PX use "Nueva caja" (CAJA-N) y agregue lotes desde el detalle de caja.');
  };

  const handlePrintPXManifest = async (rec: any) => {
    try {
      const { boxes, equipments } = await fetchPxPrintData(rec.id);

      const manifestBoxes = (boxes || []).map((b: any) => ({
        ...b,
        boxCode: b.box_code,
        marca: b.brands?.name || 'N/A',
        modelo: b.models?.name || 'N/A',
        tecnologia: b.models?.technologies?.name || 'EQUIPO',
        totalEsperado: b.capacity || 0,
      }));

      printingService.printPXManifest(rec, equipments, manifestBoxes);
    } catch (error: any) {
      notify.error('Error al obtener datos para impresión', { description: error.message });
    }
  };

  const handlePrintLabelsPX = async (rec: any) => {
    try {
      const { boxes } = await fetchPxPrintData(rec.id);
      if (!boxes || boxes.length === 0) {
        notify.warning('No hay cajas para imprimir en esta recepción.');
        return;
      }

      const manifestBoxes = boxes.map((b: any) => ({
        ...b,
        boxCode: b.box_code,
        marca: b.brands?.name || 'N/A',
        modelo: b.models?.name || 'N/A',
        tecnologia: b.models?.technologies?.name || 'EQUIPO',
        totalEsperado: b.capacity || 0,
      }));

      printingService.printAllBoxLabels(manifestBoxes);
    } catch (error: any) {
      notify.error('Error al obtener datos para etiquetas', { description: error.message });
    }
  };

  const handleDeleteHistoryCAC = useCallback(async (id: string) => {
    const ok = await confirmDialog({
      title: 'Eliminar recepción',
      message: '¿Está seguro de eliminar esta recepción y todos sus sub-procesos asociados?',
      tone: 'error',
      confirmText: 'Eliminar',
    });
    if (!ok) {
      return;
    }

    let snapshot: typeof cacState.cacRecords = [];
    cacState.setCacRecords((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });

    const result = await receptionRepository.deleteCacReception(id);
    if (result?.error) {
      cacState.setCacRecords(snapshot);
      notify.error('Error al eliminar sub-procesos', { description: result.error });
    } else {
      // Mantener la caché de la query consistente (sin refetch) para que la fila
      // borrada no reaparezca al reentrar dentro del staleTime.
      queryClient.setQueryData(['receptions'], (old: any[] | undefined) =>
        old ? old.filter((r) => r.id !== id) : old
      );
    }
  }, [cacState.setCacRecords, queryClient]);

  const handleDeleteHistoryPX = useCallback(async (id: string) => {
    let snapshot: typeof pxState.pxRecords = [];
    pxState.setPxRecords((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });

    const result = await receptionRepository.deletePxReception(id);
    if (result?.error) {
      pxState.setPxRecords(snapshot);
      notify.error('Error al eliminar recepción PX', { description: result.error });
    } else {
      queryClient.setQueryData(['receptions'], (old: any[] | undefined) =>
        old ? old.filter((r) => r.id !== id) : old
      );
    }
  }, [pxState.setPxRecords, queryClient]);

  const handlePrintCACWrapper = async (item: any) => {
    let allGuias = item.allGuias || [];
    if (allGuias.length === 0 || (allGuias.length === 1 && item.received_units > 1)) {
      try {
        const serials = await fetchCacGuideSerials(item.id);
        if (serials.length > 0) {
          allGuias = serials;
        }
      } catch {
        /* fallback abajo */
      }
    }
    if (allGuias.length === 0 && item.guide_number) {
      allGuias = [item.guide_number];
    }
    printingService.printCACAcuse({ ...item, allGuias });
  };

  return (
    <ModulePage
      title={moduleMode === 'px' ? "Recepción Planta Externa (PX)" : "Recepción de Carga (CAC)"}
      category="Logística"
      actions={
        <div className="flex bg-[var(--surface-hover)] p-1 rounded-xl">
          <button 
            onClick={() => setModuleMode('px')}
            className={`rounded-lg px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all ${moduleMode === 'px' ? 'bg-[var(--heading)] text-[var(--surface)] shadow-lg' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
          >
            Módulo PX
          </button>
          <button 
            onClick={() => setModuleMode('cac')}
            className={`rounded-lg px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all ${moduleMode === 'cac' ? 'bg-[var(--heading)] text-[var(--surface)] shadow-lg' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
          >
            Módulo CAC
          </button>
        </div>
      }
    >
      <ReceptionHeader 
        moduleMode={moduleMode}
        setModuleMode={setModuleMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {moduleMode === 'px' && activeTab === 'scan' && (
        <PxReceptionTab
          {...pxState}
          {...scannerState}
          {...validationState}
          printBoxLabel={printingService.printBoxLabel}
          systemPxProviders={systemPxProviders}
          systemTechnologies={systemTechnologies}
          filteredBrands={filteredBrands}
          filteredModels={filteredModels}
          systemModels={systemModels}
          moduleMode={moduleMode}
          handleFinalizePX={handleFinalizePX}
          isSubmittingPX={isSubmittingPX || pxIncremental.isScanning}
          finalizeProgress={pxIncremental.finalizeProgress}
          handleAddCaja={handleAddCaja}
          handleAddSN_PX={handleAddSN_PX}
          isReceptionStarted={pxState.isReceptionStarted}
          setIsReceptionStarted={pxState.setIsReceptionStarted}
          useIncrementalCapture={pxIncremental.useIncrementalCapture}
          incrementalReceptionId={pxIncremental.incrementalReceptionId}
          boxMetaByCode={pxIncremental.boxMetaByCode}
          pxInProgressList={pxIncremental.pxInProgressList}
          isLoadingIncrementalResume={pxIncremental.isLoadingIncrementalResume}
          currentOperatorId={pxIncremental.currentOperatorId}
          onStartReceptionIncremental={pxIncremental.onStartReceptionIncremental}
          onResumePxReception={pxIncremental.onResumePxReception}
          onAddLotToBoxIncremental={pxIncremental.onAddLotToBoxIncremental}
          onAcquireBoxLock={pxIncremental.onAcquireBoxLock}
          onAdjustBoxQuantity={pxIncremental.onAdjustBoxQuantity}
          onCloseBoxIncremental={pxIncremental.onCloseBoxIncremental}
          onReopenBoxIncremental={pxIncremental.onReopenBoxIncremental}
          onSaveHeaderIncremental={pxIncremental.onSaveHeaderIncremental}
          onDeleteEquipmentIncremental={pxIncremental.onDeleteEquipmentIncremental}
          onDeleteBoxIncremental={pxIncremental.onDeleteBoxIncremental}
          lastSavedAt={pxIncremental.lastSyncedAt || pxState.lastSavedAt}
        />
      )}

      {moduleMode === 'cac' && activeTab === 'scan' && (
        <CacReceptionTab {...cacState} {...scannerState} {...validationState} handlePrintCAC={handlePrintCACWrapper} transportes={transportes} handleFinalizeCAC={handleFinalizeCAC} />
      )}

      {activeTab === 'history' && (
        <HistoryTab 
           moduleMode={moduleMode}
           pxRecords={pxState.pxRecords}
           cacRecords={cacState.cacRecords}
           searchTerm={searchTerm}
           setSearchTerm={setSearchTerm}
           filterPilot={filterPilot}
           setFilterPilot={setFilterPilot}
           showTimeline={showTimeline}
           setShowTimeline={setShowTimeline}
           timelineActiveGuide={timelineActiveGuide}
           setTimelineActiveGuide={setTimelineActiveGuide}
           setPxRecords={pxState.setPxRecords}
           handlePrintCAC={handlePrintCACWrapper}
           handlePrintPX={handlePrintPXManifest}
           handlePrintLabelsPX={handlePrintLabelsPX}
           handleViewPxDetails={() => {}}
           handleDeleteHistoryPX={handleDeleteHistoryPX}
           handleDeleteHistoryCAC={handleDeleteHistoryCAC}
           handleEditHistoryCAC={() => {}}
        />
      )}

    </ModulePage>
  );
}
