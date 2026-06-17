// @ts-nocheck
"use client";

import React, { useState, useEffect } from 'react';
import { ModulePage } from '@/components/module-page';
import { ReceptionHeader } from './components/ReceptionHeader';
import { PxReceptionTab } from './components/PxReceptionTab';
import { CacReceptionTab } from './components/CacReceptionTab';
import { HistoryTab } from './components/HistoryTab';

// Hooks
import { useReceptionPX } from './hooks/useReceptionPX';
import { useReceptionCAC } from './hooks/useReceptionCAC';
import { useReceptionScanner } from './hooks/useReceptionScanner';
import { useReceptionValidation } from './hooks/useReceptionValidation';

import { receptionService } from './services/receptionService';
import { printingService } from './services/printingService';
import { validationService } from './services/validationService';
import { getCarriers, getTechnologies, getBrands, getModels, getPxProviders } from '@/lib/database/config';
import { getReceptions } from '@/lib/database/receptions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

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

  // Load Scanner State
  const scannerState = useReceptionScanner();

  // Load Validation logic
  const validationState = useReceptionValidation();

  // --- SUBMIT LÓGICA (STRANGLER FIG) ---
  const handleFinalizeCAC = async () => {
    try {
      cacState.setCacError('');
      // Llamamos a la API unificada
      const response = await fetch('/api/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'CAC',
          payload: {
            numeroSerie: cacState.cacScannedItems[0] || 'DESCONOCIDO',
            // En CAC, el transportista y agencia es global
            fallaReportada: 'Recepción CAC masiva'
          }
        })
      });

      if (!response.ok) {
        let errorMsg = 'Error en el servidor al procesar la recepción CAC';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          const textData = await response.text();
          errorMsg = textData || errorMsg;
        }

        if (errorMsg === 'El nuevo módulo de recepción no está activo') {
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
          
          alert('Recepción CAC guardada con éxito e ingresada a Bodega General.');
          cacState.setCacScannedItems([]);
          scannerState.setIsIndustrialScanning(false);
          cacState.setCacPilot('');
          cacState.setCacCarrier('');
          cacState.setCacAgency('');
          cacState.setCacTotalCajas(0);
        } else {
          throw new Error(errorMsg);
        }
      } else {
        await response.json(); // Consumir body
        alert('Recepción CAC guardada con éxito mediante Arquitectura Enterprise');
        cacState.setCacScannedItems([]);
        scannerState.setIsIndustrialScanning(false);
        cacState.setCacPilot('');
        cacState.setCacCarrier('');
        cacState.setCacAgency('');
        cacState.setCacTotalCajas(0);
      }
    } catch (err: any) {
      cacState.setCacError(err.message || 'Error de conexión');
    }
  };

  const [isSubmittingPX, setIsSubmittingPX] = useState(false);

  const handleFinalizePX = async () => {
    if (isSubmittingPX) return;
    try {
      if (pxState.manifestItems.length === 0) {
        alert('No hay cajas en el manifiesto.');
        return;
      }
      if (pxState.scannedSeries.length === 0) {
        alert('No hay series escaneadas.');
        return;
      }

      setIsSubmittingPX(true);

      // Utilizamos la lógica Legacy directamente para asegurar el ingreso a Bodega General
      const result = await receptionService.finalizePXReception(
        pxState.guideData,
        pxState.manifestItems,
        pxState.scannedSeries,
        systemBrands,
        systemModels,
        currentUserFullName
      );

      if (result && result.error) {
        throw new Error(result.error);
      }

      alert('Recepción PX guardada con éxito e ingresada a Bodega General.');
      
      // Limpiar formulario
      pxState.setManifestItems([]);
      pxState.setScannedSeries([]);
      pxState.setGuideData({ 
        sap: '', 
        docReferencia: '', 
        agencia: 'Monte Verdes', 
        proveedorPx: '', 
        guia: '', 
        piloto: '', 
        courier: '',
        totalCajasEsperadas: 1
      });
      pxState.setIsReceptionStarted(false);
      scannerState.setIsIndustrialScanning(false);
      
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
      console.error(err);
      alert(err.message || 'Error de conexión');
    } finally {
      setIsSubmittingPX(false);
    }
  };
  
  // --- CONFIG STATE ---
  const [transportes, setTransportes] = useState<any[]>([]);
  const [systemTechnologies, setSystemTechnologies] = useState<any[]>([]);
  const [systemBrands, setSystemBrands] = useState<any[]>([]);
  const [systemModels, setSystemModels] = useState<any[]>([]);
  const [systemPxProviders, setSystemPxProviders] = useState<any[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<any[]>([]);
  const [filteredModels, setFilteredModels] = useState<any[]>([]);

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
    const { currentEntry, setManifestItems, manifestItems, setCurrentEntry, setSelectedBoxForScan } = pxState;
    if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
      alert("Por favor, complete tecnología, marca, modelo y cantidad esperada.");
      return;
    }
    
    const newBoxCode = `PX-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    setManifestItems([...manifestItems, {
      id: Math.random().toString(36).substr(2, 9),
      boxCode: newBoxCode,
      ...currentEntry,
      material: ''
    }]);

    setSelectedBoxForScan(newBoxCode);
    
    setCurrentEntry({
      ...currentEntry,
      totalEsperado: 0
    });
  };

  const handleAddSN_PX = async (e: React.FormEvent) => {
    e.preventDefault();
    const { selectedBoxForScan, currentScans, manifestItems, scannedSeries, setScannedSeries, setCurrentScans } = pxState;

    if (!selectedBoxForScan) {
      alert("Seleccione una caja primero.");
      return;
    }

    const box = manifestItems.find((i: any) => i.boxCode === selectedBoxForScan);
    if (!box) return;

    if (!currentScans[0] || currentScans[0].trim() === '') {
      return;
    }

    const currentCount = scannedSeries.filter((s: any) => s.boxCode === selectedBoxForScan).length;
    if (currentCount >= box.totalEsperado) {
      alert(`La caja ${selectedBoxForScan} ya alcanzó su capacidad de ${box.totalEsperado} equipos.`);
      return;
    }

    const serialNum = currentScans[0].trim().toUpperCase();

    // 1. Validación de duplicado en UI (para todos los inputs no vacíos)
    const validScans = currentScans.map(s => s?.trim().toUpperCase()).filter(s => s !== '');
    
    // a. Verificar duplicados entre los mismos inputs actuales
    if (new Set(validScans).size !== validScans.length) {
      alert("Ha ingresado series duplicadas en los campos de escaneo.");
      return;
    }

    // b. Verificar duplicados contra lo ya escaneado
    const isDuplicateInScanned = scannedSeries.some((s: any) => 
      validScans.includes(s.sn) || 
      validScans.includes(s.s2) || 
      validScans.includes(s.s3) || 
      validScans.includes(s.s4)
    );

    if (isDuplicateInScanned) {
      alert("Una o más series ingresadas ya han sido escaneadas en esta recepción.");
      return;
    }

    // 2. Validación de estado en Base de Datos
    try {
      const validation = await validationService.checkSerialInSystem(serialNum);
      if (validation.blocked) {
        alert(validation.info);
        return;
      }
    } catch (err: any) {
      console.error(err);
      alert("Error validando serie en base de datos: " + err.message);
      return;
    }

    setScannedSeries([
      ...scannedSeries,
      {
        boxCode: selectedBoxForScan,
        sn: serialNum,
        s2: currentScans[1]?.trim().toUpperCase(),
        s3: currentScans[2]?.trim().toUpperCase(),
        s4: currentScans[3]?.trim().toUpperCase(),
        material: box.material
      }
    ]);

    setCurrentScans(['', '', '', '']);
    setTimeout(() => {
      document.getElementById('scan-input-0')?.focus();
    }, 10);
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
        .select('*, brands(name), models(name, technologies(name))')
        .eq('current_reception_id', rec.id);

      if (seriesError) throw seriesError;

      const manifestBoxes = (boxes || []).map((b: any) => ({
        ...b,
        boxCode: b.box_code,
        marca: b.brands?.name || 'N/A',
        modelo: b.models?.name || 'N/A',
        tecnologia: b.models?.technologies?.name || 'EQUIPO',
        totalEsperado: b.capacity || 0
      }));

      const mappedSeries = (series || []).map((s: any) => ({
        ...s,
        sn: s.serial_number,
        marca: s.brands?.name || 'N/A',
        modelo: s.models?.name || 'N/A',
        boxCode: boxes?.find(bx => bx.id === s.current_box_id)?.box_code || ''
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
        <PxReceptionTab {...pxState} {...scannerState} {...validationState} printBoxLabel={printingService.printBoxLabel} systemPxProviders={systemPxProviders} systemTechnologies={systemTechnologies} filteredBrands={filteredBrands} filteredModels={filteredModels} systemModels={systemModels} moduleMode={moduleMode} handleFinalizePX={handleFinalizePX} isSubmittingPX={isSubmittingPX} handleAddCaja={handleAddCaja} handleAddSN_PX={handleAddSN_PX} isReceptionStarted={pxState.isReceptionStarted} setIsReceptionStarted={pxState.setIsReceptionStarted} />
      )}

      {moduleMode === 'cac' && activeTab === 'scan' && (
        <CacReceptionTab {...cacState} {...scannerState} {...validationState} handlePrintCAC={printingService.printCACAcuse} transportes={transportes} handleFinalizeCAC={handleFinalizeCAC} />
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
           handlePrintCAC={printingService.printCACAcuse}
           handlePrintPX={handlePrintPXManifest}
           handlePrintLabelsPX={handlePrintLabelsPX}
           handleViewPxDetails={() => {}}
           handleDeleteHistoryCAC={async (id: string) => {
             const confirmDelete = window.confirm('¿Está seguro de eliminar esta recepción y todos sus sub-procesos asociados?');
             if (!confirmDelete) return;
             try {
               const supabase = getSupabaseBrowserClient();
               
               // Buscar las series asociadas a esta recepción
               const { data: seriesList } = await supabase.from('series').select('id').eq('current_reception_id', id);
               
               if (seriesList && seriesList.length > 0) {
                 const seriesIds = seriesList.map((s: any) => s.id);
                 
                 // Buscar service_orders de estas series
                 const { data: soList } = await supabase.from('service_orders').select('id').in('series_id', seriesIds);
                 
                 if (soList && soList.length > 0) {
                   const soIds = soList.map((so: any) => so.id);
                   // Eliminar tablas dependientes de service_orders
                   await supabase.from('workshop_jobs').delete().in('service_order_id', soIds);
                   await supabase.from('qc_checks').delete().in('service_order_id', soIds);
                   // Si hay una tabla diagnostico
                   await supabase.from('diagnostico').delete().in('service_order_id', soIds).catch(() => {});
                   
                   // Eliminar service_orders
                   await supabase.from('service_orders').delete().in('series_id', seriesIds);
                 }
                 
                 // Eliminar de box_series
                 await supabase.from('box_series').delete().in('series_id', seriesIds);
                 
                 // Eliminar series
                 await supabase.from('series').delete().in('id', seriesIds);
               }
               
               // Marcar cajas como eliminadas para mantener el consecutivo de IDs
               await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('reception_id', id);

               // Finalmente actualizar el estatus de la recepción
               const { error } = await supabase.from('receptions').update({ status: 'ELIMINADO' }).eq('id', id);
               if (error) throw error;
               cacState.setCacRecords((prev: any[]) => prev.filter((r: any) => r.id !== id));
             } catch (err: any) {
               alert('Error al eliminar sub-procesos: ' + err.message);
             }
           }}
           handleEditHistoryCAC={() => {}}
        />
      )}

    </ModulePage>
  );
}
