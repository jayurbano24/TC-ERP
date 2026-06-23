'use client';

import type React from 'react';
import { TablePagination } from '@/components/ui/TablePagination';

export const CAC_HISTORY_PAGE_SIZE = 10;

type Props = {
  totalCount: number;
  safePage: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
};

export function ReceptionCacHistoryPagination({
  totalCount,
  safePage,
  totalPages,
  startItem,
  endItem,
  setHistoryPage,
}: Props) {
  return (
    <TablePagination
      totalCount={totalCount}
      page={safePage}
      totalPages={totalPages}
      startItem={startItem}
      endItem={endItem}
      pageSize={CAC_HISTORY_PAGE_SIZE}
      onPageChange={setHistoryPage}
      itemLabel="recepciones"
    />
  );
}
