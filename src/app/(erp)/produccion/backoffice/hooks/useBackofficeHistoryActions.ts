'use client';

import { useCallback } from 'react';
import { updateReceptionStatus } from '@/lib/database/receptions';
import { processBlockReturnBySapTransfer } from '@/lib/database/returns';
import { downloadReportApi, isCentralReportingEnabledClient } from '@/modules/reporting/client/reportingApi';
import { exportHistoryReport } from '../history/exportHistoryReport';
import type { HistoryUnitEntry } from '../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../types';

type Params = {
  fetchExportEntries: () => Promise<HistoryUnitEntry[]>;
  catalogs: {
    CAC_AGENCIES: CatalogAgency[];
    MASTER_TECNOLOGIAS: CatalogTech[];
    MASTER_MARCAS: CatalogBrand[];
    MASTER_MODELOS: CatalogModel[];
  };
  dateFilterFrom: string;
  dateFilterTo: string;
  fetchPending: (opts?: { silent?: boolean }) => Promise<void>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  currentUserFullName: string;
};

export function useBackofficeHistoryActions({
  fetchExportEntries,
  catalogs,
  dateFilterFrom,
  dateFilterTo,
  fetchPending,
  fetchHistory,
  currentUserFullName,
}: Params) {
  const handleExportReport = useCallback(async () => {
    try {
      if (isCentralReportingEnabledClient()) {
        await downloadReportApi('CAC_CLASIFICACION_HISTORICO', {
          from: dateFilterFrom || undefined,
          to: dateFilterTo || undefined,
        });
        return;
      }
      const entries = await fetchExportEntries();
      await exportHistoryReport(entries, catalogs, dateFilterFrom, dateFilterTo);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Error al exportar el reporte.');
    }
  }, [catalogs, dateFilterFrom, dateFilterTo, fetchExportEntries]);

  const handleReturnToPending = useCallback(
    async (receptionId: string) => {
      if (!confirm('¿Está seguro de regresar este lote a estado PENDIENTE?')) return;
      try {
        const { success, error } = await updateReceptionStatus(receptionId, 'PENDIENTE_BACKOFFICE');
        if (success) {
          alert('Lote regresado a Pendiente con éxito.');
          await fetchPending();
          await fetchHistory();
        } else {
          alert(`Error: ${error}`);
        }
      } catch (err) {
        console.error(err);
        alert('Error al procesar la solicitud.');
      }
    },
    [fetchHistory, fetchPending]
  );

  const handleSapBlockReturn = useCallback(
    async (entry: HistoryUnitEntry) => {
      if (!entry.sapTransferId) {
        window.location.href = `/logistica/devoluciones?reception_id=${entry.rec.id}`;
        return;
      }
      const unitCount = entry.unit.length;
      const msg =
        `Devolución en bloque por Documento SAP ${entry.unitSap}.
` +
        `Se revertirán TODAS las unidades asociadas a este documento SAP en la guía (no solo esta fila).

¿Continuar?`;
      if (!confirm(msg)) return;
      const motivo = prompt('Motivo de la devolución:');
      if (!motivo?.trim()) return;
      const guiaSalida = prompt('Guía de salida / tracking:');
      if (!guiaSalida?.trim()) return;
      try {
        const res = await processBlockReturnBySapTransfer(
          entry.sapTransferId,
          { motivo: motivo.trim(), guiaSalida: guiaSalida.trim() },
          currentUserFullName
        );
        if (res.error) {
          alert(res.error);
          return;
        }
        alert(
          `Devolución en bloque aplicada (${res.unitsCount ?? unitCount} equipo(s) del Documento SAP ${entry.unitSap}).`
        );
        await fetchHistory();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error de conexión al procesar la devolución. Intente de nuevo.';
        console.error(err);
        alert(message);
      }
    },
    [currentUserFullName, fetchHistory]
  );

  return { handleExportReport, handleReturnToPending, handleSapBlockReturn };
}
