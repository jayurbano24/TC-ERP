'use client';

import { Card } from '@/components/ui';
import type { SemaphoreTone, ServiceSemaphoreItem } from '@/modules/system-health/types';

type Props = {
  items: ServiceSemaphoreItem[];
};

function dot(tone: SemaphoreTone) {
  if (tone === 'ok') return 'bg-[var(--success)]';
  if (tone === 'warn') return 'bg-[var(--warning)]';
  if (tone === 'error') return 'bg-[var(--danger)]';
  if (tone === 'not_configured') return 'bg-[var(--muted)]';
  return 'bg-[var(--muted)]';
}

function label(tone: SemaphoreTone) {
  if (tone === 'ok') return 'OK';
  if (tone === 'warn') return 'WARN';
  if (tone === 'error') return 'FAIL';
  if (tone === 'not_configured') return 'N/C';
  return '?';
}

export function ServiceSemaphore({ items }: Props) {
  return (
    <Card className="p-4">
      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
        Semáforo de servicios
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${dot(item.tone)}`} />
              <span className="text-[9px] font-black uppercase text-[var(--muted)]">
                {label(item.tone)}
              </span>
            </div>
            <p className="mt-2 text-xs font-black uppercase tracking-wide text-[var(--heading)]">
              {item.label}
            </p>
            <p className="mt-1 truncate text-[11px] text-[var(--muted)]">{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
