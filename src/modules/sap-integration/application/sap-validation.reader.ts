import {
  assertSapOperationAllowed,
  resolveUnitSapStatus,
  type SapValidationState,
} from '../domain/sap-validation-status';
import type {
  ISapValidationReader,
  SapGateDecision,
  SapOperation,
  SapUnitValidationInput,
} from '../domain/ports/sap-validation.port';

/**
 * Implementación por defecto del port de validación SAP: in-process, basada en
 * las reglas puras del dominio. No accede a la base de datos; recibe el estado
 * crudo ya leído por el llamador.
 */
export class DefaultSapValidationReader implements ISapValidationReader {
  resolveStatus(input: SapUnitValidationInput): SapValidationState {
    return resolveUnitSapStatus(input.integrationStatus, input.seriesStatuses);
  }

  authorize(input: SapUnitValidationInput, operation: SapOperation): SapGateDecision {
    const status = this.resolveStatus(input);
    const check = assertSapOperationAllowed(status, operation);
    if (check.ok) {
      return { allowed: true, status };
    }
    return { allowed: false, status, reason: check.message };
  }
}

/** Instancia compartida lista para usar en los gates operativos. */
export const sapValidationReader: ISapValidationReader = new DefaultSapValidationReader();
