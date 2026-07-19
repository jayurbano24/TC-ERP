'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

type Props = {
  value: string;
  onChange: (value: string) => void;
  delayMs?: number;
};

/**
 * Input de búsqueda con estado local: la tabla/padre solo se actualiza
 * tras el debounce (evita input delay por re-render de toda la bandeja).
 */
export function HistorySearchInput({ value, onChange, delayMs = 350 }: Props) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebouncedValue(draft, delayMs);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (debounced !== value) onChange(debounced);
  }, [debounced, onChange, value]);

  return (
    <div className="relative group flex-1 min-w-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--accent)] transition-colors" />
      <input
        type="text"
        placeholder="BUSCAR SERIE, GUÍA O SAP..."
        className="w-full h-10 pl-10 pr-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl font-medium text-[10px] text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all uppercase tracking-wider"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}
