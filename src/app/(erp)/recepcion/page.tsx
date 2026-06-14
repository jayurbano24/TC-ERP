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

// Services
import { receptionService } from './services/receptionService';
import { printingService } from './services/printingService';
import { getCarriers, getTechnologies, getBrands, getModels, getPxProviders } from '@/lib/database/config';
import { getReceptions } from '@/lib/database/receptions';

export default function ReceptionsPage() {
  const [moduleMode, setModuleMode] = useState<'cac' | 'px'>('cac');
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [currentUserFullName, setCurrentUserFullName] = useState('OPERADOR_SISTEMA');

  // Load PX State
  const pxState = useReceptionPX();
  
  // Load CAC State
  const cacState = useReceptionCAC();

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

      const data = await response.json();
      
      if (!response.ok) {
        if (data.error === 'El nuevo módulo de recepción no está activo') {
          // Fallback a lógica legacy si el Feature Flag está apagado
          alert('Fallback a lógica Legacy (Feature Flag OFF)');
        } else {
          throw new Error(data.error);
        }
      } else {
        alert('Recepción CAC guardada con éxito mediante Arquitectura Enterprise');
        cacState.setCacScannedItems([]);
        scannerState.setIsIndustrialScanning(false);
      }
    } catch (err: any) {
      cacState.setCacError(err.message);
    }
  };

  const handleFinalizePX = async () => {
    try {
      pxState.setPxError('');
      // Llamamos a la API unificada
      const response = await fetch('/api/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'PX',
          payload: {
            numeroSerie: pxState.scannedItems[0] || 'DESCONOCIDO',
            guiaPx: pxState.guideData.guiaPx || 'S/N',
            transporte: pxState.guideData.proveedorPx || 'PROPIO'
          }
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (data.error === 'El nuevo módulo de recepción no está activo') {
          // Fallback a lógica legacy si el Feature Flag está apagado
          alert('Fallback a lógica Legacy (Feature Flag OFF)');
        } else {
          throw new Error(data.error);
        }
      } else {
        alert('Recepción PX guardada con éxito mediante Arquitectura Enterprise');
        pxState.setScannedItems([]);
        scannerState.setIsIndustrialScanning(false);
      }
    } catch (err: any) {
      pxState.setPxError(err.message);
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
  }, []);

  useEffect(() => {
    if (pxState.currentEntry.tecnologia) {
      const techId = systemTechnologies.find(t => t.name === pxState.currentEntry.tecnologia)?.id;
      setFilteredBrands(systemBrands.filter(b => b.technology_id === techId));
    } else {
      setFilteredBrands(systemBrands);
    }
  }, [pxState.currentEntry.tecnologia, systemTechnologies, systemBrands]);

  useEffect(() => {
    if (pxState.currentEntry.marca) {
      const brandId = systemBrands.find(b => b.name === pxState.currentEntry.marca)?.id;
      setFilteredModels(systemModels.filter(m => m.brand_id === brandId));
    } else {
      setFilteredModels(systemModels);
    }
  }, [pxState.currentEntry.marca, systemBrands, systemModels]);

  
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
        <PxReceptionTab {...pxState} {...scannerState} {...validationState} printBoxLabel={printingService.printBoxLabel} systemPxProviders={systemPxProviders} systemTechnologies={systemTechnologies} filteredBrands={filteredBrands} filteredModels={filteredModels} systemModels={systemModels} moduleMode={moduleMode} handleFinalizePX={handleFinalizePX} />
      )}

      {moduleMode === 'cac' && activeTab === 'scan' && (
        <CacReceptionTab {...cacState} {...scannerState} {...validationState} handlePrintCAC={printingService.printCACAcuse} transportes={transportes} handleFinalizeCAC={handleFinalizeCAC} />
      )}

      {activeTab === 'history' && (
        <HistoryTab 
           moduleMode={moduleMode}
           pxRecords={pxState.pxRecords}
           cacRecords={cacState.cacRecords}
           // Pass other required state handlers here
        />
      )}

    </ModulePage>
  );
}
