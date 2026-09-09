'use client';

import {
  useRef,
  useLayoutEffect,
  useState,
  useCallback,
  type ReactNode,
  type RefObject,
} from 'react';

const H_SCROLLBAR =
  'w-full max-w-full overflow-x-auto overflow-y-hidden custom-scrollbar [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/90 [&::-webkit-scrollbar-track]:bg-slate-200/90 dark:[&::-webkit-scrollbar-thumb]:bg-slate-500 dark:[&::-webkit-scrollbar-track]:bg-slate-800/80';

export type HorizontalScrollAreaProps = {
  children: ReactNode;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
  hideTopWhenNoOverflow?: boolean;
  /** Fuerza ancho mínimo del contenido (evita que desaparezca el scroll al cambiar página). */
  minContentWidth?: number;
};

/**
 * Barra de scroll horizontal arriba (y abajo como respaldo), sincronizadas.
 */
export function HorizontalScrollArea({
  children,
  className = '',
  scrollRef: externalScrollRef,
  hideTopWhenNoOverflow = true,
  minContentWidth,
}: HorizontalScrollAreaProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [showTopBar, setShowTopBar] = useState(Boolean(minContentWidth));

  const mainRef = externalScrollRef ?? internalScrollRef;

  const syncScroll = useCallback((from: HTMLDivElement, to: HTMLDivElement) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    to.scrollLeft = from.scrollLeft;
    syncingRef.current = false;
  }, []);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const top = topRef.current;
    const content = contentRef.current;
    if (!main || !top || !content) return;

    const mirror = top.firstElementChild as HTMLDivElement | null;
    if (!mirror) return;

    const updateMirror = () => {
      const measured = Math.max(content.scrollWidth, content.getBoundingClientRect().width);
      const scrollWidth =
        minContentWidth != null ? Math.max(minContentWidth, measured) : measured;
      if (minContentWidth != null) {
        content.style.minWidth = `${minContentWidth}px`;
      }
      mirror.style.width = `${scrollWidth}px`;
      mirror.style.height = '1px';
      const hasOverflow =
        minContentWidth != null ? minContentWidth > main.clientWidth + 2 : scrollWidth > main.clientWidth + 2;
      if (hideTopWhenNoOverflow) {
        setShowTopBar(hasOverflow);
      } else {
        setShowTopBar(true);
      }
    };

    updateMirror();
    const t1 = requestAnimationFrame(updateMirror);
    const t2 = window.setTimeout(updateMirror, 0);
    const t3 = window.setTimeout(updateMirror, 120);

    const ro = new ResizeObserver(() => updateMirror());
    ro.observe(content);
    ro.observe(main);

    const onMainScroll = () => syncScroll(main, top);
    const onTopScroll = () => syncScroll(top, main);
    main.addEventListener('scroll', onMainScroll, { passive: true });
    top.addEventListener('scroll', onTopScroll, { passive: true });

    return () => {
      cancelAnimationFrame(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro.disconnect();
      main.removeEventListener('scroll', onMainScroll);
      top.removeEventListener('scroll', onTopScroll);
    };
  }, [mainRef, syncScroll, hideTopWhenNoOverflow, minContentWidth, children]);

  return (
    <div className={`min-w-0 max-w-full ${className}`}>
      {showTopBar ? (
        <div
          ref={topRef}
          className={`${H_SCROLLBAR} min-h-[14px] shrink-0 border-b border-[var(--border)] bg-[var(--surface-hover)]`}
          aria-label="Desplazamiento horizontal superior"
        >
          <div aria-hidden />
        </div>
      ) : null}
      <div ref={mainRef} className={`${H_SCROLLBAR} min-w-0 max-w-full`}>
        <div ref={contentRef} className="inline-block w-max min-w-full align-top">
          {children}
        </div>
      </div>
    </div>
  );
}
