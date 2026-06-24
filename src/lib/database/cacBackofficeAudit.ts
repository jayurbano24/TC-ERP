import { logAdvancedAudit, type AdvancedAuditPayload } from '@/lib/database/audit';
import {
  CAC_DOMAIN_EVENTS,
  DOMAIN_EVENT_SOURCE,
  emitDomainEvent,
} from '@/lib/database/domainEvents';

export const CAC_BACKOFFICE_MODULE = 'cac_backoffice';

export const CAC_AUDIT_ACTIONS = {
  SAP_TRANSFER_CREATED: 'SAP_TRANSFER_CREATED',
  SAP_TRANSFER_AGENCY_UPDATED: 'SAP_TRANSFER_AGENCY_UPDATED',
  CLASSIFY_BATCH: 'CLASSIFY_BATCH',
  CLASSIFY_UNIT: 'CLASSIFY_UNIT',
  SERIES_CLASSIFIED: 'SERIES_CLASSIFIED',
  GUIDE_COMPLETED: 'GUIDE_COMPLETED',
  RECEPTION_CLASSIFIED: 'RECEPTION_CLASSIFIED',
  DEVOLUCION_BLOQUE_SAP: 'DEVOLUCION_BLOQUE_SAP',
} as const;

export type CacAuditAction = (typeof CAC_AUDIT_ACTIONS)[keyof typeof CAC_AUDIT_ACTIONS];

export async function logCacBackofficeAudit(
  params: Omit<AdvancedAuditPayload, 'module'> & { action: CacAuditAction | string }
) {
  return logAdvancedAudit({
    ...params,
    module: CAC_BACKOFFICE_MODULE,
  });
}

export async function auditClassifiedSeries(
  seriesIds: string[],
  context: {
    sapTransferId: string;
    registeredBy: string;
    sapDocumentNumber?: string;
    correlationId?: string;
  }
) {
  if (!seriesIds.length) return;

  const correlationId = context.correlationId ?? context.sapTransferId;

  for (const seriesId of seriesIds) {
    await logCacBackofficeAudit({
      tableName: 'series',
      recordId: seriesId,
      action: CAC_AUDIT_ACTIONS.SERIES_CLASSIFIED,
      newValues: {
        status: 'RECEPCIONADO_BODEGA_GENERAL',
        source: 'cac',
        sap_transfer_id: context.sapTransferId,
        sap_document_number: context.sapDocumentNumber,
        registered_by: context.registeredBy,
      },
    });

    await emitDomainEvent({
      eventType: CAC_DOMAIN_EVENTS.SERIES_CLASSIFIED,
      aggregateType: 'series',
      aggregateId: seriesId,
      correlationId,
      actorLabel: context.registeredBy,
      payload: {
        status: 'RECEPCIONADO_BODEGA_GENERAL',
        sap_transfer_id: context.sapTransferId,
        sap_document_number: context.sapDocumentNumber,
      },
    });
  }
}

export async function auditClassifyBatchCompleted(params: {
  receptionId: string;
  sapTransferId: string;
  unitsCount: number;
  seriesCount: number;
  registeredBy: string;
  correlationId: string;
  sapDocumentNumber?: string;
}) {
  await logCacBackofficeAudit({
    tableName: 'sap_transfer_documents',
    recordId: params.sapTransferId,
    action: CAC_AUDIT_ACTIONS.CLASSIFY_BATCH,
    newValues: {
      reception_id: params.receptionId,
      sap_transfer_id: params.sapTransferId,
      units_count: params.unitsCount,
      series_count: params.seriesCount,
      registered_by: params.registeredBy,
      correlation_id: params.correlationId,
    },
    observations: `Lote clasificado: ${params.unitsCount} equipo(s), ${params.seriesCount} serie(s)`,
  });

  await emitDomainEvent({
    eventType: CAC_DOMAIN_EVENTS.CLASSIFY_BATCH_COMPLETED,
    aggregateType: 'reception',
    aggregateId: params.receptionId,
    correlationId: params.correlationId,
    actorLabel: params.registeredBy,
    payload: {
      sap_transfer_id: params.sapTransferId,
      sap_document_number: params.sapDocumentNumber,
      units_count: params.unitsCount,
      series_count: params.seriesCount,
    },
  });
}

export async function auditSapTransferCreated(params: {
  sapTransferId: string;
  receptionId: string;
  sapDocumentNumber: string;
  agency?: string | null;
  registeredBy?: string;
}) {
  await logCacBackofficeAudit({
    tableName: 'sap_transfer_documents',
    recordId: params.sapTransferId,
    action: CAC_AUDIT_ACTIONS.SAP_TRANSFER_CREATED,
    newValues: {
      reception_id: params.receptionId,
      sap_document_number: params.sapDocumentNumber,
      agency: params.agency,
      registered_by: params.registeredBy,
      status: 'PENDIENTE_INGRESO_BODEGA',
    },
    observations: `Documento SAP ${params.sapDocumentNumber} registrado en backoffice CAC`,
  });

  await emitDomainEvent({
    eventType: CAC_DOMAIN_EVENTS.SAP_TRANSFER_REGISTERED,
    aggregateType: 'sap_transfer_document',
    aggregateId: params.sapTransferId,
    correlationId: params.receptionId,
    actorLabel: params.registeredBy ?? null,
    payload: {
      sap_document_number: params.sapDocumentNumber,
      agency: params.agency,
      client_fallback: true,
    },
  });
}

export async function auditGuideCompleted(params: {
  receptionId: string;
  guideNumber: string;
  category: string;
  agency?: string | null;
  classifiedBy: string;
  osCount?: number;
}) {
  await logCacBackofficeAudit({
    tableName: 'reception_guides',
    recordId: params.guideNumber,
    action: CAC_AUDIT_ACTIONS.GUIDE_COMPLETED,
    newValues: {
      reception_id: params.receptionId,
      guide_number: params.guideNumber,
      category: params.category,
      agency: params.agency,
      classified_by: params.classifiedBy,
      os_count: params.osCount ?? 0,
    },
    observations: `Guía ${params.guideNumber} clasificada (${params.category})`,
  });

  await emitDomainEvent({
    eventType: CAC_DOMAIN_EVENTS.GUIDE_COMPLETED,
    aggregateType: 'reception_guide',
    aggregateId: params.guideNumber,
    correlationId: params.receptionId,
    actorLabel: params.classifiedBy,
    payload: {
      guide_number: params.guideNumber,
      category: params.category,
      agency: params.agency,
      os_count: params.osCount ?? 0,
    },
  });
}

export async function auditReceptionClassified(params: {
  receptionId: string;
  guideNumbers: string[];
  classifiedBy: string;
}) {
  await logCacBackofficeAudit({
    tableName: 'receptions',
    recordId: params.receptionId,
    action: CAC_AUDIT_ACTIONS.RECEPTION_CLASSIFIED,
    newValues: {
      status: 'CLASIFICADA',
      processed_guides: params.guideNumbers,
      classified_by: params.classifiedBy,
    },
    observations: `Recepción clasificada (${params.guideNumbers.length} guía(s))`,
  });

  await emitDomainEvent({
    eventType: CAC_DOMAIN_EVENTS.RECEPTION_CLASSIFIED,
    aggregateType: 'reception',
    aggregateId: params.receptionId,
    correlationId: params.receptionId,
    source: DOMAIN_EVENT_SOURCE.CAC_BACKOFFICE,
    actorLabel: params.classifiedBy,
    payload: {
      status: 'CLASIFICADA',
      processed_guides: params.guideNumbers,
    },
  });
}
