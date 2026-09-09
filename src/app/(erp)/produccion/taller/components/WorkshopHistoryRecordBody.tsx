'use client';

import {
  collectWorkshopCatalogIds,
  formatWorkshopNextStatusLabel,
  formatWorkshopResultLabel,
  parseWorkshopEvaluationNotes,
  resolveWorkshopCatalogName,
  workshopCatalogListTitle,
  type WorkshopCatalogEntry,
} from '@/modules/workshop/shared/workshopHistoryDisplay';

type Props = {
  action: string;
  payload: Record<string, unknown>;
  diagnosticsCatalog: WorkshopCatalogEntry[];
  repairsCatalog: WorkshopCatalogEntry[];
  catalogNamesById?: Record<string, string>;
};

export function WorkshopHistoryRecordBody({
  action,
  payload,
  diagnosticsCatalog,
  repairsCatalog,
  catalogNamesById,
}: Props) {
  const catalogIds = collectWorkshopCatalogIds(payload);
  const notes =
    (typeof payload.notes === 'string' && payload.notes) ||
    (typeof payload.observations === 'string' && payload.observations) ||
    '';
  const parsedNotes = parseWorkshopEvaluationNotes(notes);
  const listTitle = workshopCatalogListTitle(action);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-[var(--foreground)]">
      {payload.result ? (
        <p className="font-medium">
          <span className="font-black text-[var(--heading)]">Resultado:</span>{' '}
          {formatWorkshopResultLabel(payload.result)}
        </p>
      ) : null}

      {catalogIds.length > 0 ? (
        <div>
          <p className="font-black text-[var(--heading)]">{listTitle}:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {catalogIds.map((id) => (
              <li key={id} className="font-medium">
                {resolveWorkshopCatalogName(id, diagnosticsCatalog, repairsCatalog, catalogNamesById)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {parsedNotes.sectionLabel || parsedNotes.bodyLines.length > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
          {parsedNotes.sectionLabel ? (
            <p className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">
              Evaluación · {parsedNotes.sectionLabel}
            </p>
          ) : null}
          {parsedNotes.bodyLines.length > 0 ? (
            <div className={`space-y-1 ${parsedNotes.sectionLabel ? 'mt-2' : ''}`}>
              {parsedNotes.bodyLines.map((line, idx) => {
                const kv = line.match(/^([^:]+):\s*(.+)$/);
                if (kv) {
                  return (
                    <p key={idx} className="font-medium">
                      <span className="font-black text-[var(--heading)]">{kv[1]}:</span> {kv[2]}
                    </p>
                  );
                }
                return (
                  <p key={idx} className="whitespace-pre-wrap font-medium">
                    {line}
                  </p>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {parsedNotes.additionalNotes ? (
        <p className="whitespace-pre-wrap font-medium text-[var(--muted)]">
          <span className="font-black text-[var(--heading)]">Notas adicionales:</span>{' '}
          {parsedNotes.additionalNotes}
        </p>
      ) : null}

      {payload.nextStatus ? (
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-black tracking-wide text-[var(--primary-foreground)]">
            <span className="text-white/70">DERIVADO A:</span>
            {formatWorkshopNextStatusLabel(payload.nextStatus)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
