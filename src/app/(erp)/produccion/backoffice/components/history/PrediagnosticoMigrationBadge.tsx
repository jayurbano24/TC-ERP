'use client';

import { Badge } from '@/components/ui';
import { isPrediagnosticoBackfillNotes } from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillMarkers';

type Props = {
  notes?: string | null;
  className?: string;
};

export function PrediagnosticoMigrationBadge({ notes, className }: Props) {
  if (!isPrediagnosticoBackfillNotes(notes)) return null;
  return (
    <Badge
      className={`border-none bg-violet-500/15 px-1.5 py-0 text-[8px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300 ${className ?? ''}`}
      title="Pre-diagnóstico generado por migración CHG-015 (stock histórico)"
    >
      Migración
    </Badge>
  );
}
