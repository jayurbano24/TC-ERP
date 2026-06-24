export {
  registerIndividualReturnHex,
  processBlockReturnBySapTransferHex,
} from './factory';
export { isHexagonalReturnsEnabled } from './infrastructure/feature-flags';
export type { IndividualReturnEntry, IndividualReturnResult } from './domain/types/return.types';
export type { ISapTransferReturnPort } from './domain/ports/sap-transfer-return.port';
