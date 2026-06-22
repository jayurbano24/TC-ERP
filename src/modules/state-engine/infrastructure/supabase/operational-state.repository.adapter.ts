import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OperationalSnapshot,
  ServiceOrderOperationalState,
} from '../../domain/entities/service-order-operational-state.entity';
import {
  isOperationalStateCode,
  type OperationalStateCode,
} from '../../domain/enums/operational-state-code.enum';
import type {
  IOperationalStateRepository,
  UpsertOperationalStateParams,
} from '../../domain/ports/operational-state.repository.port';

type OpsRow = {
  service_order_id: string;
  state_code: string;
  state_label: string;
  source_channel: string | null;
  series_status: string | null;
  tray_active: boolean | null;
  tray_excluded: string | null;
  updated_at: string;
};

function mapRow(row: OpsRow): ServiceOrderOperationalState {
  const stateCode = isOperationalStateCode(row.state_code)
    ? row.state_code
    : ('otro' as OperationalStateCode);

  return {
    serviceOrderId: row.service_order_id,
    stateCode,
    stateLabel: row.state_label,
    sourceChannel: row.source_channel,
    seriesStatus: row.series_status,
    trayActive: row.tray_active,
    trayExcluded: row.tray_excluded,
    updatedAt: row.updated_at,
  };
}

export class OperationalStateRepositoryAdapter implements IOperationalStateRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getByServiceOrderId(serviceOrderId: string): Promise<ServiceOrderOperationalState | null> {
    const { data, error } = await this.supabase
      .from('service_order_operational_state')
      .select('*')
      .eq('service_order_id', serviceOrderId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapRow(data as OpsRow);
  }

  async upsert(params: UpsertOperationalStateParams): Promise<ServiceOrderOperationalState> {
    const { data, error } = await this.supabase
      .from('service_order_operational_state')
      .upsert({
        service_order_id: params.serviceOrderId,
        state_code: params.stateCode,
        state_label: params.stateLabel,
        source_channel: params.sourceChannel ?? null,
        series_status: params.seriesStatus ?? null,
        tray_active: params.trayActive ?? null,
        tray_excluded: params.trayExcluded ?? null,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return mapRow(data as OpsRow);
  }

  async getOperationalSnapshot(): Promise<OperationalSnapshot> {
    const [reconRes, snapshotRes] = await Promise.all([
      this.supabase
        .from('vw_kpi_snapshot_reconciliation')
        .select('ledger_total, snapshot_total, delta')
        .maybeSingle(),
      this.supabase
        .from('vw_kpi_snapshot')
        .select('state_code, state_label, os_count')
        .order('os_count', { ascending: false }),
    ]);

    if (reconRes.error) throw new Error(reconRes.error.message);
    if (snapshotRes.error) throw new Error(snapshotRes.error.message);

    const recon = reconRes.data as Record<string, unknown> | null;
    const delta = Number(recon?.delta ?? 0);

    return {
      ledgerTotal: Number(recon?.ledger_total ?? 0),
      snapshotTotal: Number(recon?.snapshot_total ?? 0),
      delta,
      reconciled: delta === 0,
      buckets: (snapshotRes.data || []).map((row: Record<string, unknown>) => ({
        stateCode: String(row.state_code ?? ''),
        stateLabel: String(row.state_label ?? ''),
        osCount: Number(row.os_count ?? 0),
      })),
    };
  }
}
