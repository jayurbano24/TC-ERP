'use client';

import { useCallback } from 'react';
import { notify, confirmDialog, promptDialog } from '@/components/ui/messaging/messageStore';
import { updateReceptionStatus } from '@/modules/recepcion/client/receptions';
import { processBlockReturnBySapTransfer } from '@/modules/returns/client/returnData';
import { sapDocumentBase } from '@/modules/sap-transfer';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { downloadReportApi, isCentralReportingEnabledClient } from '@/modules/reporting/client/reportingApi';
import { exportHistoryReport } from '../history/exportHistoryReport';
import type { HistoryUnitEntry } from '../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../types';

type Params = {
  fetchExportEntries: (opts?: { allData?: boolean }) => Promise<HistoryUnitEntry[]>;
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
  const handleExportReport = useCallback(async (opts?: { allData?: boolean }) => {
    const allData = Boolean(opts?.allData) || (!dateFilterFrom && !dateFilterTo);
    try {
      if (isCentralReportingEnabledClient()) {
        await downloadReportApi('CAC_CLASIFICACION_HISTORICO', {
          ...(allData
            ? { allData: true }
            : {
                from: dateFilterFrom || undefined,
                to: dateFilterTo || undefined,
              }),
        });
        notify.success(
          allData
            ? 'Reporte generado con todos los datos.'
            : 'Reporte generado con el rango de fechas seleccionado.'
        );
        return;
      }
      const entries = await fetchExportEntries({ allData });
      await exportHistoryReport(
        entries,
        catalogs,
        allData ? '' : dateFilterFrom,
        allData ? '' : dateFilterTo
      );
    } catch (err) {
      console.error(err);
      notify.error(err instanceof Error ? err.message : 'Error al exportar el reporte.');
    }
  }, [catalogs, dateFilterFrom, dateFilterTo, fetchExportEntries]);

  const handleReturnToPending = useCallback(
    async (receptionId: string) => {
      const ok = await confirmDialog({ title: 'Regresar a Pendiente', message: '¿Está seguro de regresar este lote a estado PENDIENTE?', confirmText: 'Regresar' });
      if (!ok) return;
      try {
        const { success, error } = await updateReceptionStatus(receptionId, 'PENDIENTE_BACKOFFICE');
        if (success) {
          notify.success('Lote regresado a Pendiente con éxito.');
          await fetchPending();
          await fetchHistory();
        } else {
          notify.error('No se pudo regresar el lote', { description: String(error) });
        }
      } catch (err) {
        console.error(err);
        notify.error('Error al procesar la solicitud.');
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

      const sapDoc = String(entry.unitSap || '').trim();
      const sapBase = sapDocumentBase(sapDoc) || sapDoc;
      if (!sapBase) {
        notify.error('No se pudo determinar el Número SAP Base de este registro.');
        return;
      }

      let docsPreview: string[] = sapDoc ? [sapDoc] : [];
      try {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const { data } = await supabase
            .from('sap_transfer_documents')
            .select('sap_document_number')
            .or(`sap_document_number.eq.${sapBase},sap_document_number.like.${sapBase}-%`)
            .order('sap_document_number');
          const nums = (data || [])
            .map((d: { sap_document_number?: string }) => String(d.sap_document_number || '').trim())
            .filter(Boolean);
          if (nums.length) docsPreview = nums;
        }
      } catch {
        /* preview opcional */
      }

      const msg =
        `Devolver Bloque SAP\n\n` +
        `SAP Base: ${sapBase}\n` +
        `Documentos: ${docsPreview.join(', ')}\n\n` +
        `Se enviarán a estado "Devolución" TODOS los equipos de este bloque en una sola transacción.\n` +
        `Si alguno no puede actualizarse, se cancela toda la operación.\n\n` +
        `¿Continuar?`;

      const ok = await confirmDialog({
        title: 'Devolver Bloque SAP',
        message: msg,
        confirmText: 'Continuar',
      });
      if (!ok) return;

      const motivo = await promptDialog({
        title: 'Motivo de la devolución',
        prompt: { required: true, multiline: true, placeholder: 'Indique el motivo (obligatorio)' },
      });
      if (!motivo?.trim()) {
        notify.warning('Devolución cancelada: el motivo es obligatorio.');
        return;
      }

      const guiaSalida = await promptDialog({
        title: 'Guía de salida / tracking',
        prompt: { required: true },
      });
      if (!guiaSalida?.trim()) {
        notify.warning('Devolución cancelada: la guía de salida es obligatoria.');
        return;
      }

      try {
        const res = await processBlockReturnBySapTransfer(
          entry.sapTransferId,
          { motivo: motivo.trim(), guiaSalida: guiaSalida.trim() },
          currentUserFullName
        );
        if (res.error) {
          notify.error('No se pudo procesar la devolución', { description: res.error });
          return;
        }
        notify.success('Devolución Bloque SAP aplicada', {
          description:
            `Base ${res.sapBase || sapBase} · ${res.documentsCount ?? docsPreview.length} documento(s) · ` +
            `${res.unitsCount ?? 0} equipo(s) → Devolución.`,
        });
        await fetchHistory();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error de conexión al procesar la devolución. Intente de nuevo.';
        console.error(err);
        notify.error('Error al procesar la devolución', { description: message });
      }
    },
    [currentUserFullName, fetchHistory]
  );

  return { handleExportReport, handleReturnToPending, handleSapBlockReturn };
}
