"use client";

import React, { useState, useEffect } from 'react';
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

  // TODO: Add initialization useEffects here calling receptionService
  
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{moduleMode === 'px' ? "Recepción Planta Externa (PX)" : "Recepción de Carga (CAC)"}</h1>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setModuleMode('px')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'px' ? 'bg-[var(--heading)] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Módulo PX
          </button>
          <button 
            onClick={() => setModuleMode('cac')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'cac' ? 'bg-[var(--heading)] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Módulo CAC
          </button>
        </div>
      </div>
      <ReceptionHeader 
        moduleMode={moduleMode}
        setModuleMode={setModuleMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {moduleMode === 'px' && activeTab === 'scan' && (
        <PxReceptionTab {...pxState} {...scannerState} {...validationState} printBoxLabel={printingService.printBoxLabel} />
      )}

      {moduleMode === 'cac' && activeTab === 'scan' && (
        <CacReceptionTab {...cacState} {...scannerState} {...validationState} handlePrintCAC={printingService.printCACAcuse} />
      )}

      {activeTab === 'history' && (
        <HistoryTab 
           moduleMode={moduleMode}
           pxRecords={pxState.pxRecords}
           cacRecords={cacState.cacRecords}
           // Pass other required state handlers here
        />
      )}

    </div>
  );
}
