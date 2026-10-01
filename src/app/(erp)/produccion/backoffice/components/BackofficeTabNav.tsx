'use client';

import type { BackofficeTab } from '../types';

type Props = {
  activeTab: BackofficeTab;
  onTabChange: (tab: BackofficeTab) => void;
};

export function BackofficeTabNav({ activeTab, onTabChange }: Props) {
  const tabs: { id: BackofficeTab; label: string; activeClass: string }[] = [
    { id: 'op', label: 'NUEVA RECEPCIÓN', activeClass: 'bg-[var(--accent)]' },
    { id: 'history', label: 'HISTORIAL / REGISTROS', activeClass: 'bg-[var(--accent)]' },
    { id: 'prediagnostico', label: 'PRE-DIAGNÓSTICO', activeClass: 'bg-[var(--accent)]' },
    { id: 'sub_accesorios', label: 'BODEGA ACCESORIOS', activeClass: 'bg-emerald-500' },
    { id: 'sub_telefonos', label: 'BODEGA TELÉFONOS', activeClass: 'bg-amber-500' },
  ];

  return (
    <div className="mb-8 flex items-center gap-6 overflow-x-auto border-b border-[var(--border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`relative whitespace-nowrap px-2 pb-4 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${
            activeTab === tab.id ? 'text-[var(--heading)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
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
