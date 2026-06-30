import type { OperationalStateCode } from '../enums/operational-state-code.enum';
import type {
  OperationalSnapshot,
  ServiceOrderOperationalState,
} from '../entities/service-order-operational-state.entity';

/** Parámetros para crear/actualizar el estado operativo de una OS. */
export interface UpsertOperationalStateParams {
  serviceOrderId: string;
  stateCode: OperationalStateCode;
  stateLabel: string;
  sourceChannel?: string | null;
  seriesStatus?: string | null;
  trayActive?: boolean | null;
  trayExcluded?: string | null;
}

/** Puerto de persistencia del snapshot operativo (Motor 2). */
export interface IOperationalStateRepository {
  getByServiceOrderId(
    serviceOrderId: string
  ): Promise<ServiceOrderOperationalState | null>;
  upsert(params: UpsertOperationalStateParams): Promise<ServiceOrderOperationalState>;
  getOperationalSnapshot(): Promise<OperationalSnapshot>;
}
