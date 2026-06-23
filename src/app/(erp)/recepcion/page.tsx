// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { ModulePage } from '@/components/module-page';
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
import { getCarriers, getTechnologies, getBrands, getModels, getPxProviders } from '@/lib/database/config';
import { getReceptions, deletePxReceptionCascade, deleteCacReceptionCascade } from '@/lib/database/receptions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { groupPxSeriesByEquipment } from './utils/pxSeriesUtils';

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

  useEffect(() => {
    getSupabaseBrowserClient().auth.getUser().then(({data}) => {
      if (data?.user?.user_metadata?.full_name) {
        setCurrentUserFullName(data.user.user_metadata.full_name);
      } else if (data?.user?.email) {
        setCurrentUserFullName(data.user.email.split('@')[0]);
      }
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
        alert('No hay guías escaneadas.');
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
      
      alert('Recepción CAC guardada. Pendiente de clasificación en Backoffice.');
      cacState.setCacScannedItems([]);
      scannerState.setIsIndustrialScanning(false);
      cacState.setCacPilot('');
      cacState.setCacCarrier('');
      cacState.setCacAgency('');
      cacState.setCacTotalCajas(0);

      // Recargar el historial silenciosamente
      const historyData = await getReceptions();
      if (historyData) {
        const mappedPx: any[] = [];
        const mappedCac: any[] = [];
        for (const row of historyData) {
          const legacyRec = {
            id: row.id,
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
            pilot_display: row.carrier || 'OPERADOR LOGÍSTICO',
            allGuias: row.processed_guides || []
          };
          if (row.source === 'px') mappedPx.push(legacyRec);
          else mappedCac.push(legacyRec);
        }
        pxState.setPxRecords(mappedPx);
        cacState.setCacRecords(mappedCac);
      }
    } catch (err: any) {
      cacState.setCacError(err.message || 'Error de conexión');
    }
  };

  const refreshHistory = useCallback(async () => {
    const historyData = await getReceptions();
    if (!historyData) return;
    const mappedPx: any[] = [];
    const mappedCac: any[] = [];
    for (const row of historyData) {
      const legacyRec = {
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
        pilot_display: row.notes?.split('Piloto: ')?.[1]?.split('\n')?.[0]?.trim() || row.carrier || 'OPERADOR LOGÍSTICO',
        allGuias: row.processed_guides || [],
      };
      if (row.source === 'px') mappedPx.push(legacyRec);
      else mappedCac.push(legacyRec);
    }
    pxState.setPxRecords(mappedPx);
    cacState.setCacRecords(mappedCac);
  }, [pxState, cacState]);

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
          getTechnologies(),
          getBrands(),
          getModels(),
          getPxProviders(),
          getCarriers()
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

    const fetchHistory = async () => {
      try {
        const data = await getReceptions();
        
        if (data) {
          const mappedPx: any[] = [];
          const mappedCac: any[] = [];
          
          for (const row of data) {
            // Already in legacy format, but ensure proper shape for HistoryTab
            const legacyRec = {
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
              pilot_display: row.notes?.split('Piloto: ')?.[1]?.split('\n')?.[0]?.trim() || row.carrier || 'OPERADOR LOGÍSTICO',
              allGuias: row.processed_guides || []
            };
            
            if (row.source === 'px') {
              mappedPx.push(legacyRec);
            } else {
              mappedCac.push(legacyRec);
            }
          }
          
          pxState.setPxRecords(mappedPx);
          cacState.setCacRecords(mappedCac);
        }
      } catch(err) {
        console.error('Error fetching history', err);
      }
    };
    fetchHistory();
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
    alert('En recepción PX use "Nueva caja" (CAJA-N) y agregue lotes desde el detalle de caja.');
  };

  const handlePrintPXManifest = async (rec: any) => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const { data: boxes, error: boxError } = await supabase
        .from('boxes')
        .select('*, brands(name), models(name, technologies(name))')
        .eq('reception_id', rec.id);

      if (boxError) throw boxError;

      const { data: series, error: seriesError } = await supabase
        .from('series')
        .select('serial_number, service_order_id, current_box_id, material')
        .eq('current_reception_id', rec.id);

      if (seriesError) throw seriesError;

      const { data: serviceOrders } = await supabase
        .from('service_orders')
        .select('id, main_serial')
        .eq('reception_id', rec.id);

      const boxCodeById = Object.fromEntries((boxes || []).map((b: any) => [b.id, b.box_code]));
      const mappedSeries = groupPxSeriesByEquipment(series || [], serviceOrders || [], boxCodeById);

      const manifestBoxes = (boxes || []).map((b: any) => ({
        ...b,
        boxCode: b.box_code,
        marca: b.brands?.name || 'N/A',
        modelo: b.models?.name || 'N/A',
        tecnologia: b.models?.technologies?.name || 'EQUIPO',
        totalEsperado: b.capacity || 0
      }));

      printingService.printPXManifest(rec, mappedSeries, manifestBoxes);
    } catch (error: any) {
      alert("Error al obtener datos para impresión: " + error.message);
    }
  };

  const handlePrintLabelsPX = async (rec: any) => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const { data: boxes, error: boxError } = await supabase
        .from('boxes')
        .select('*, brands(name), models(name, technologies(name))')
        .eq('reception_id', rec.id);

      if (boxError) throw boxError;
      if (!boxes || boxes.length === 0) {
        alert("No hay cajas para imprimir en esta recepción.");
        return;
      }

      const manifestBoxes = boxes.map((b: any) => ({
        ...b,
        boxCode: b.box_code,
        marca: b.brands?.name || 'N/A',
        modelo: b.models?.name || 'N/A',
        tecnologia: b.models?.technologies?.name || 'EQUIPO',
        totalEsperado: b.capacity || 0
      }));

      printingService.printAllBoxLabels(manifestBoxes);
    } catch (error: any) {
      alert("Error al obtener datos para etiquetas: " + error.message);
    }
  };

  const handleDeleteHistoryCAC = useCallback(async (id: string) => {
    if (!window.confirm('¿Está seguro de eliminar esta recepción y todos sus sub-procesos asociados?')) {
      return;
    }

    let snapshot: typeof cacState.cacRecords = [];
    cacState.setCacRecords((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });

    const result = await deleteCacReceptionCascade(id);
    if (result?.error) {
      cacState.setCacRecords(snapshot);
      alert('Error al eliminar sub-procesos: ' + result.error);
    }
  }, [cacState.setCacRecords]);

  const handleDeleteHistoryPX = useCallback(async (id: string) => {
    let snapshot: typeof pxState.pxRecords = [];
    pxState.setPxRecords((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });

    const result = await deletePxReceptionCascade(id);
    if (result?.error) {
      pxState.setPxRecords(snapshot);
      alert('Error al eliminar recepción PX: ' + result.error);
    }
  }, [pxState.setPxRecords]);

  const handlePrintCACWrapper = async (item: any) => {
    let allGuias = item.allGuias || [];
    if (allGuias.length === 0 || (allGuias.length === 1 && item.received_units > 1)) {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data } = await supabase.from('series').select('serial_number').eq('current_reception_id', item.id);
        if (data && data.length > 0) {
          allGuias = data.map((s: any) => s.serial_number);
        }
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
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setModuleMode('px')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'px' ? 'bg-[#181c3a] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Módulo PX
          </button>
          <button 
            onClick={() => setModuleMode('cac')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'cac' ? 'bg-[#181c3a] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
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
