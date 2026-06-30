import type { OperationalStateCode } from '../enums/operational-state-code.enum';

/**
 * Contexto opcional de una transición de estado operativo.
 * Se propaga al timeline (correlación, actor, motivo) y queda disponible para
 * políticas que necesiten metadatos adicionales.
 */
export interface TransitionContext {
  correlationId?: string;
  actorLabel?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

/** Resultado de validar una transición. */
export type TransitionValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Puerto de política de transición entre estados operativos. */
export interface ITransitionPolicy {
  validate(
    from: OperationalStateCode | null,
    to: OperationalStateCode,
    context: TransitionContext
  ): TransitionValidationResult;
}
