import { useEffect, useMemo, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 25;

/** Paginación cliente: slice + metadatos; reinicia a página 1 cuando cambian resetDeps. */
export function useClientPagination<T>(
  items: T[],
  pageSize = DEFAULT_PAGE_SIZE,
  resetDeps: unknown[] = []
) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  return useMemo(() => {
    const totalCount = items.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startItem = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const endItem = Math.min(safePage * pageSize, totalCount);
    const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize);

    return {
      slice,
      page: safePage,
      setPage,
      totalPages,
      totalCount,
      startItem,
      endItem,
      pageSize,
    };
  }, [items, page, pageSize]);
}
