import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import type { ClassifyBatchParams, ClassifyBatchResult } from '../../domain/types/equipment-unit.types';
import { humanizeClassifyEquipmentError } from '../../client/humanizeClassifyError';

/**
 * Backoffice: classify vía API Next (maxDuration 300s) con sub-lotes en servidor.
 * Evita timeouts del cliente directo a PostgREST en guías multi-serie (IPTV).
 */
export class ClassifyEquipmentBatchRpcAdapter implements IClassifyBatchGateway {
  async classifyBatch(params: ClassifyBatchParams): Promise<ClassifyBatchResult> {
    try {
      const res = await apiFetch('/api/v1/backoffice/classify-equipment-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        cache: 'no-store',
      });
      return await readApiJson<ClassifyBatchResult>(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const human = humanizeClassifyEquipmentError(msg);
      return { error: human.description };
    }
  }
}
