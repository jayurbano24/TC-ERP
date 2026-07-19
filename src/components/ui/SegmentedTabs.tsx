'use client';

import { erpTab } from '@/lib/design/tokens';

export type SegmentedTabItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  items: SegmentedTabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** Extra classes on each trigger (e.g. flex-1). */
  triggerClassName?: string;
};

/** Control segmentado temático (reemplaza tabs bg-slate-100 / bg-white). */
export function SegmentedTabs({
  items,
  value,
  onChange,
  className = '',
  triggerClassName = '',
}: Props) {
  return (
    <div className={`${erpTab.list} ${className}`} role="tablist">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={[
              erpTab.trigger,
              active ? erpTab.triggerActive : erpTab.triggerInactive,
              item.disabled ? 'cursor-not-allowed opacity-40' : '',
              triggerClassName,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
