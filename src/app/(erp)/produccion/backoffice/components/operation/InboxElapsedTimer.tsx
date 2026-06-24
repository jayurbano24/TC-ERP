'use client';

import { ErpIcon } from '@/lib/design/icons';
import { formatDisplayDateTime } from '@/lib/formatDisplayDate';
import { elapsedHoursSince, formatElapsedSince } from '@/lib/formatElapsedSince';
import { useNow } from '@/hooks/useNow';

type Props = {
  since: string;
};

function urgencyClass(hours: number): string {
  if (hours >= 72) return 'text-rose-400';
  if (hours >= 24) return 'text-amber-400';
  return 'text-[#2ec4f1]';
}

export function InboxElapsedTimer({ since }: Props) {
  const now = useNow(30_000);
  const hours = elapsedHoursSince(since, now);
  const elapsed = formatElapsedSince(since, now);

  return (
    <div className="mt-4 space-y-1">
      <div className="flex items-center gap-2">
        <ErpIcon name="clock" className="w-3.5 h-3.5 text-[#2ec4f1]" />
        <span className={`text-[10px] font-black uppercase tracking-widest ${urgencyClass(hours)}`}>
          En espera: {elapsed}
        </span>
      </div>
      <p className="text-[9px] font-bold text-[var(--muted)] pl-5">
        Recibido {formatDisplayDateTime(since)}
      </p>
    </div>
  );
}
