'use client';

import type { BackofficeTab } from '../types';

type Props = {
  activeTab: BackofficeTab;
  onTabChange: (tab: BackofficeTab) => void;
};

export function BackofficeTabNav({ activeTab, onTabChange }: Props) {
  const tabs: { id: BackofficeTab; label: string; activeClass: string }[] = [
    { id: 'op', label: 'NUEVA RECEPCIÓN', activeClass: 'bg-[#2ec4f1]' },
    { id: 'history', label: 'HISTORIAL / REGISTROS', activeClass: 'bg-[#2ec4f1]' },
    { id: 'sub_accesorios', label: 'BODEGA ACCESORIOS', activeClass: 'bg-emerald-500' },
    { id: 'sub_telefonos', label: 'BODEGA TELÉFONOS', activeClass: 'bg-amber-500' },
  ];

  return (
    <div className="flex items-center gap-10 mb-8 border-b border-slate-100">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`pb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${
            activeTab === tab.id ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <div className={`absolute bottom-0 left-0 w-full h-1.5 ${tab.activeClass} rounded-t-full`} />
          )}
        </button>
      ))}
    </div>
  );
}
