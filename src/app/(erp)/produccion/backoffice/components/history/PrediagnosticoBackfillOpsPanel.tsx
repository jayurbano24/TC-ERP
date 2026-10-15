'use client';

import { useState } from 'react';
import { Button, Card, notify } from '@/components/ui';
import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import { ChevronDown, Play, ShieldAlert } from 'lucide-react';

type BackfillResponse = {
  dryRun: boolean;
  completed?: boolean;
  batchesRun?: number;
  candidatesInBatch: number;
  aggregates: {
    processed: number;
    inserted: number;
    skippedExisting: number;
    skippedNoCatalog: number;
    errors: number;
  };
  rates: {
    verdict: Record<string, number>;
    shell: Record<string, number>;
    timing: Record<string, number>;
  };
  error?: string;
};

export function PrediagnosticoBackfillOpsPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<BackfillResponse | null>(null);
  const [pilotLimit, setPilotLimit] = useState(100);

  const run = async (opts: { dryRun: boolean; apply?: boolean; runAll?: boolean; limit?: number }) => {
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.apply) headers['X-Backfill-Confirm'] = 'CHG-015';
      const res = await apiFetch('/api/v1/backoffice/prediagnostico/backfill', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dryRun: opts.dryRun,
          limit: opts.limit ?? 500,
          offset: opts.runAll ? undefined : 0,
          runAll: opts.runAll ?? false,
          confirmApply: opts.apply ?? false,
        }),
      });
      const data = await readApiJson<BackfillResponse & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'Backfill falló');
      }
      setLastResult(data);
      notify.success(opts.dryRun ? 'Dry-run completado' : 'Lote apply completado', {
        description: `Procesados: ${data.aggregates.processed} · insertados/simulados: ${data.aggregates.inserted}`,
      });
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : 'Error en backfill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-2xl border border-dashed border-violet-300/50 bg-violet-500/5 p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-violet-800 dark:text-violet-200">
          <ShieldAlert size={14} />
          CHG-015 · Migración stock (admin)
        </span>
        <ChevronDown size={14} className={`text-violet-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-violet-200/40 px-4 py-3 text-xs text-[var(--muted)]">
          <p>
            Requiere migración <strong>255</strong> y <code className="text-[10px]">PREDIAG_BACKFILL_CUTOFF</code> en el
            servidor. En producción: dry-run completo → piloto → apply con ventana de mantenimiento.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              className="text-[10px] font-bold uppercase"
              onClick={() => void run({ dryRun: true, runAll: true, maxBatches: 500 } as never)}
            >
              <Play size={12} className="mr-1" /> Dry-run completo
            </Button>
            <label className="flex items-center gap-1 text-[10px] uppercase">
              Piloto
              <input
                type="number"
                min={1}
                max={500}
                value={pilotLimit}
                onChange={(e) => setPilotLimit(Number(e.target.value) || 100)}
                className="w-16 rounded border border-[var(--border)] px-1 py-0.5 text-[10px]"
              />
            </label>
            <Button
              type="button"
              disabled={loading}
              className="text-[10px] font-bold uppercase"
              onClick={() => void run({ dryRun: false, apply: true, limit: pilotLimit })}
            >
              Apply piloto
            </Button>
          </div>
          {lastResult ? (
            <pre className="custom-scrollbar max-h-40 overflow-auto rounded-lg bg-[var(--surface)] p-2 text-[9px] text-[var(--foreground)]">
              {JSON.stringify(
                {
                  dryRun: lastResult.dryRun,
                  completed: lastResult.completed,
                  batchesRun: lastResult.batchesRun,
                  aggregates: lastResult.aggregates,
                  rates: lastResult.rates,
                },
                null,
                2
              )}
            </pre>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
