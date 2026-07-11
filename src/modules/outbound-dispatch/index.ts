export { isHexagonalOutboundDispatchEnabled } from './infrastructure/feature-flags';
export type { DispatchBatchSummary } from './domain/types/dispatch-batch.types';

// Handlers hex: importar desde '@/modules/outbound-dispatch/factory'
// (evita que páginas client arrastren el barrel con adapters).
