import type { SapValidationState } from '../sap-validation-status';

/** Operación operativa sujeta a la matriz de bloqueos SAP. */
export type SapOperation = 'dispatch' | 'transfer';

/**
 * Datos crudos de una unidad necesarios para resolver su estado SAP.
 * Se mantiene desacoplado de cualquier esquema de persistencia.
 */
export type SapUnitValidationInput = {
  /** Estado de integración SAP del equipo / OS (texto crudo). */
  integrationStatus?: string | null;
  /** Estados SAP de las series S1–S4 asociadas (texto crudo). */
  seriesStatuses?: (string | null | undefined)[];
};

/** Decisión del gate operativo para una unidad y una operación dada. */
export type SapGateDecision =
  | { allowed: true; status: SapValidationState }
  | { allowed: false; status: SapValidationState; reason: string };

/**
 * Port de LECTURA de validación SAP para el gate operativo (despacho / traslado).
 *
 * Los consumidores (UI de despacho/bodega, API) dependen de esta interfaz, no de
 * la implementación. Permite sustituir la fuente de verdad (hoy: reglas en
 * proceso; mañana: consulta directa a integración SAP) sin tocar los gates.
 */
export interface ISapValidationReader {
  /** Resuelve el estado SAP efectivo de la unidad (equipo + series). */
  resolveStatus(input: SapUnitValidationInput): SapValidationState;

  /** Autoriza (o bloquea) una operación según el estado SAP resuelto. */
  authorize(input: SapUnitValidationInput, operation: SapOperation): SapGateDecision;
}
