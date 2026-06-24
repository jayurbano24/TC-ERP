// @ts-nocheck
import React from 'react';
import { Truck, Box } from 'lucide-react';

interface ReceptionHeaderProps {
  moduleMode: 'cac' | 'px';
  setModuleMode: (mode: 'cac' | 'px') => void;
  activeTab: 'scan' | 'history';
  setActiveTab: (tab: 'scan' | 'history') => void;
}

export const ReceptionHeader: React.FC<ReceptionHeaderProps> = ({ moduleMode, setModuleMode, activeTab, setActiveTab }) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-[#2ec4f1] rounded-xl flex items-center justify-center shadow-lg shadow-[#2ec4f1]/30">
            {moduleMode === 'cac' ? <Truck className="text-[#181c3a] w-5 h-5" /> : <Box className="text-[#181c3a] w-5 h-5" />}
          </div>
          <h1 className="text-3xl font-black text-[var(--heading)] tracking-tight">
            Recepción <span className="text-[#2ec4f1]">{moduleMode === 'cac' ? 'CAC' : 'PX'}</span>
          </h1>
        </div>
        <p className="text-[var(--muted)] font-medium text-sm">
          {moduleMode === 'cac' ? 'Centros de Atención al Cliente' : 'Planta Externa y Cuadrillas'}
        </p>
      </div>

      <div className="flex items-center gap-2 bg-[var(--surface)] p-1 rounded-xl shadow-sm border border-[var(--border)]">
        <button
          onClick={() => setActiveTab('scan')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'scan' ? 'bg-[#181c3a] text-white shadow-md' : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'
          }`}
        >
          Operación
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'history' ? 'bg-[#181c3a] text-white shadow-md' : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'
          }`}
        >
          Historial
        </button>
      </div>

      <div className="flex items-center gap-2 bg-[var(--surface-hover)] p-1 rounded-xl">
        <button
          onClick={() => setModuleMode('cac')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            moduleMode === 'cac' ? 'bg-[var(--surface)] text-[#2ec4f1] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          CAC
        </button>
        <button
          onClick={() => setModuleMode('px')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            moduleMode === 'px' ? 'bg-[var(--surface)] text-[#2ec4f1] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          PX
        </button>
      </div>
    </div>
  );
};
