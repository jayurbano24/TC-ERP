import Link from 'next/link';
import { ChevronRight, LayoutDashboard } from 'lucide-react';
import type { ElementType } from 'react';

type ErpNavItemProps = {
  href: string;
  label: string;
  description?: string;
  icon?: ElementType;
  active: boolean;
  expanded: boolean;
  onNavigate?: () => void;
};

export function ErpNavItem({
  href,
  label,
  description,
  icon: Icon = LayoutDashboard,
  active,
  expanded,
  onNavigate,
}: ErpNavItemProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={expanded ? description : label}
      aria-current={active ? 'page' : undefined}
      className={[
        'group flex items-center rounded-xl border border-transparent py-2 transition-colors',
        active
          ? 'border-[var(--accent)]/40 bg-[var(--sidebar-foreground)]/10 text-[var(--sidebar-foreground)] shadow-sm'
          : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-foreground)]/10',
        expanded ? 'justify-between px-2.5' : 'mx-1 justify-center',
      ].join(' ')}
    >
      <div className="flex min-w-0 w-full items-center gap-2.5">
        <Icon
          size={16}
          strokeWidth={2.25}
          className={[
            'shrink-0 transition-colors',
            active
              ? 'text-[var(--accent)]'
              : 'text-[var(--sidebar-foreground)]',
          ].join(' ')}
          aria-hidden
        />
        {expanded ? (
          <div className="flex min-w-0 flex-col overflow-hidden">
            <span className="truncate text-xs font-semibold leading-tight text-[var(--sidebar-foreground)]">
              {label}
            </span>
            {description ? (
              <span
                className={[
                  'truncate text-[10px] font-medium leading-tight',
                  active
                    ? 'text-[var(--sidebar-foreground)]/80'
                    : 'text-[var(--sidebar-foreground)]/70',
                ].join(' ')}
              >
                {description}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {active && expanded ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent)] opacity-80" aria-hidden />
      ) : null}
    </Link>
  );
}
