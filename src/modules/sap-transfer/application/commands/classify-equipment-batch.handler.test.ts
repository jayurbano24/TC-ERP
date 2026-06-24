import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import { ClassifyEquipmentBatchCommand } from './classify-equipment-batch.command';
import { ClassifyEquipmentBatchHandler } from './classify-equipment-batch.handler';

describe('ClassifyEquipmentBatchHandler', () => {
  const rpcGateway: IClassifyBatchGateway = { classifyBatch: vi.fn() };
  const handler = new ClassifyEquipmentBatchHandler(rpcGateway);

  const unit = {
    main_serial: 'SN-001',
    model_id: 'model-1',
    brand_id: 'brand-1',
    all_series: ['SN-001'],
  };

  const command = new ClassifyEquipmentBatchCommand('rec-1', 'sap-1', [unit], 'operator-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza lote vacío', async () => {
    const empty = new ClassifyEquipmentBatchCommand('rec-1', 'sap-1', [], 'operator-1');
    const result = await handler.execute(empty);
    expect(result.error).toMatch(/No hay equipos/i);
    expect(rpcGateway.classifyBatch).not.toHaveBeenCalled();
  });

  it('delega al gateway RPC atómico', async () => {
    vi.mocked(rpcGateway.classifyBatch).mockResolvedValue({ data: [{ id: 'os-1' }] });

    const withCorrelation = new ClassifyEquipmentBatchCommand(
      'rec-1',
      'sap-1',
      [unit],
      'operator-1',
      'corr-classify-001'
    );
    const result = await handler.execute(withCorrelation);

    expect(rpcGateway.classifyBatch).toHaveBeenCalledWith({
      receptionId: 'rec-1',
      sapTransferId: 'sap-1',
      units: [unit],
      registeredBy: 'operator-1',
      correlationId: 'corr-classify-001',
    });
    expect(result.data).toHaveLength(1);
  });

  it('propaga error del gateway', async () => {
    vi.mocked(rpcGateway.classifyBatch).mockResolvedValue({ error: 'SAP lock timeout' });

    const result = await handler.execute(command);

    expect(result.error).toBe('SAP lock timeout');
  });
});
