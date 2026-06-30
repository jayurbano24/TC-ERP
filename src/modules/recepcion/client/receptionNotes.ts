/**
 * Recepción — parsers puros de notas (legacy bridge).
 *
 * ARCH-01 seam para `parseReceptionReceiverFromNotes` (función pura) sin que
 * la UI importe `@/lib/database/traceability`.
 */
export { parseReceptionReceiverFromNotes } from '@/lib/database/traceability';
