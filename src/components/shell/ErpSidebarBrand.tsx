type ErpSidebarBrandProps = {
  expanded: boolean;
};

function TcMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 565 280" className={className} aria-hidden>
      <g fill="currentColor">
        <rect x="8" y="9" width="232" height="60" />
        <rect x="92" y="9" width="65" height="271" />
      </g>
      <g fill="currentColor">
        <circle cx="425" cy="140" r="140" />
        <circle cx="425" cy="140" r="85" className="fill-[var(--sidebar)]" />
        <rect x="500" y="100" width="80" height="60" className="fill-[var(--sidebar)]" />
        <circle cx="425" cy="140" r="35" />
      </g>
    </svg>
  );
}

export function ErpSidebarBrand({ expanded }: ErpSidebarBrandProps) {
  return (
    <div className="flex min-h-14 items-center justify-between border-b border-[var(--sidebar-foreground)]/10 px-3 py-3">
      {expanded ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <TcMark className="h-6 w-auto shrink-0 text-[var(--sidebar-foreground)]" />
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-sm font-bold leading-none tracking-tight text-[var(--sidebar-foreground)]">
              MULTIMEDIA
            </h1>
            <span className="mt-0.5 truncate text-[10px] font-semibold tracking-wide text-[var(--sidebar-foreground)]/55 uppercase">
              Enterprise
            </span>
          </div>
        </div>
      ) : (
        <div className="flex w-full justify-center">
          <TcMark className="h-5 w-auto text-[var(--sidebar-foreground)]" />
        </div>
      )}
    </div>
  );
}
