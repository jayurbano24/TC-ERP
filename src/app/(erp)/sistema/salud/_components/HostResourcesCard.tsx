'use client';

import { Card } from '@/components/ui';
import { Cpu, HardDrive, Info, Server } from 'lucide-react';

type Props = {
  note: string;
};

const ROWS = [
  { label: 'CPU', icon: Cpu },
  { label: 'RAM', icon: Server },
  { label: 'Disco', icon: HardDrive },
] as const;

export function HostResourcesCard({ note }: Props) {
  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Recursos del host
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">Métricas de infraestructura</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ROWS.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] p-4"
          >
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <Icon className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
            </div>
            <p className="mt-3 text-xl font-black text-[var(--heading)]">N/D</p>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3 text-xs text-[var(--muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <p>{note}. En Vercel serverless no hay telemetría de CPU/RAM/Disco del contenedor.</p>
      </div>
    </Card>
  );
}
