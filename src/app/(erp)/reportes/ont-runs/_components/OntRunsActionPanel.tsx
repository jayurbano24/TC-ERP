'use client';

import { FileSpreadsheet, Loader2, Printer, Download } from 'lucide-react';
import { Button, Card } from '@/components/ui';

type Props = {
  selectedCount: number;
  pageCertifiedCount: number;
  exporting: boolean;
  batchPrinting: boolean;
  disabled: boolean;
  onExportExcel: () => void;
  onPrintSelected: () => void;
  onPrintPageCertified: () => void;
  onPrintFilterCertified: () => void;
};

export function OntRunsActionPanel({
  selectedCount,
  pageCertifiedCount,
  exporting,
  batchPrinting,
  disabled,
  onExportExcel,
  onPrintSelected,
  onPrintPageCertified,
  onPrintFilterCertified,
}: Props) {
  const busy = exporting || batchPrinting;

  return (
    <Card className="p-3 border border-[var(--border)] bg-[var(--surface)] h-full">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--accent)] mb-1">Ventana de acción</p>
      <p className="text-[10px] font-bold text-[var(--muted)] mb-3 leading-snug">
        Exportar Excel del filtro activo o abrir PDF del certificador (máx. 25 por lote — permita ventanas emergentes).
      </p>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          className="!h-9 !text-[10px] !bg-[var(--accent)] !text-[var(--accent-foreground)] justify-start"
          disabled={disabled || busy}
          leftIcon={exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          onClick={onExportExcel}
        >
          Excel · filtro completo
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="!h-9 !text-[10px] justify-start"
          disabled={disabled || busy || selectedCount === 0}
          leftIcon={batchPrinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          onClick={onPrintSelected}
        >
          PDF · seleccionadas ({selectedCount})
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="!h-9 !text-[10px] justify-start"
          disabled={disabled || busy || pageCertifiedCount === 0}
          leftIcon={<Printer className="h-3.5 w-3.5" />}
          onClick={onPrintPageCertified}
        >
          PDF · página certificadas ({pageCertifiedCount})
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="!h-9 !text-[10px] justify-start"
          disabled={disabled || busy}
          leftIcon={<Download className="h-3.5 w-3.5" />}
          onClick={onPrintFilterCertified}
        >
          PDF · filtro PASS/FAIL (lote)
        </Button>
      </div>
    </Card>
  );
}
