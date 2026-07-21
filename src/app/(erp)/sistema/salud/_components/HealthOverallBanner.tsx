'use client';

import { Badge, Card } from '@/components/ui';
import { erpSoftStat } from '@/lib/design/tokens';
import { Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { HealthOverall } from '@/modules/system-health/types';

const CONFIG: Record<
  HealthOverall,
  { label: string; tone: string; icon: typeof CheckCircle2; hint: string }
> = {
  ok: {
    label: 'Sistema operativo',
    tone: erpSoftStat.success,
    icon: CheckCircle2,
    hint: 'API, base de datos y colas dentro de umbrales normales.',
  },
  degraded: {
    label: 'Sistema degradado',
    tone: erpSoftStat.warning,
    icon: AlertTriangle,
    hint: 'Hay fallos de sync, outbox FAILED o backlog elevado.',
  },
  down: {
    label: 'Sistema caído / inaccesible',
    tone: erpSoftStat.danger,
    icon: XCircle,
    hint: 'No se pudo verificar API o Supabase.',
  },
};

type Props = {
  overall: HealthOverall;
  checkedAt: string;
};

export function HealthOverallBanner({ overall, checkedAt }: Props) {
  const cfg = CONFIG[overall];
  const Icon = cfg.icon;
  return (
    <Card className={`p-6 border-l-4 ${cfg.tone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-[var(--surface)] p-3 shadow-sm">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--muted)]" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                Estado global
              </p>
            </div>
            <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--heading)]">
              {cfg.label}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{cfg.hint}</p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge className="border-none bg-[var(--surface)] text-[var(--heading)] uppercase text-[9px] font-black tracking-widest">
            {overall}
          </Badge>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
            Verificado {new Date(checkedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </Card>
  );
}
