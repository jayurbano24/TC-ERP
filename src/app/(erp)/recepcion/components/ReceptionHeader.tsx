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
            {moduleMode === 'cac' ? <Truck className="text-white w-5 h-5" /> : <Box className="text-white w-5 h-5" />}
          </div>
          <h1 className="text-3xl font-black text-[#181c3a] tracking-tight">
            Recepción <span className="text-[#2ec4f1]">{moduleMode === 'cac' ? 'CAC' : 'PX'}</span>
          </h1>
        </div>
        <p className="text-[#64748b] font-medium text-sm">
          {moduleMode === 'cac' ? 'Centros de Atención al Cliente' : 'Planta Externa y Cuadrillas'}
        </p>
      </div>

      <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-100">
        <button
          onClick={() => setActiveTab('scan')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'scan' ? 'bg-[#181c3a] text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-[#181c3a]'
          }`}
        >
          Operación
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'history' ? 'bg-[#181c3a] text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-[#181c3a]'
          }`}
        >
          Historial
        </button>
      </div>

      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setModuleMode('cac')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            moduleMode === 'cac' ? 'bg-white text-[#2ec4f1] shadow-sm' : 'text-slate-400 hover:text-[#181c3a]'
          }`}
        >
          CAC
        </button>
        <button
          onClick={() => setModuleMode('px')}
          className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            moduleMode === 'px' ? 'bg-white text-[#2ec4f1] shadow-sm' : 'text-slate-400 hover:text-[#181c3a]'
          }`}
        >
          PX
        </button>
      </div>
    </div>
  );
};
