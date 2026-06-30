/**
 * Módulo sap-integration — API pública.
 *
 * Reglas y port de lectura para la validación SAP que gobierna el gate
 * operativo (despacho / traslado). Otros módulos deben importar desde aquí.
 */

export {
  normalizeSapIntegrationStatus,
  normalizeSeriesSapStatus,
  resolveUnitSapStatus,
  getSapStatusMeta,
  assertSapOperationAllowed,
} from './domain/sap-validation-status';

export type {
  SapValidationState,
  SapStatusMeta,
} from './domain/sap-validation-status';

export type {
  ISapValidationReader,
  SapOperation,
  SapUnitValidationInput,
  SapGateDecision,
} from './domain/ports/sap-validation.port';

export {
  DefaultSapValidationReader,
  sapValidationReader,
} from './application/sap-validation.reader';
