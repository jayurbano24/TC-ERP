/**
 * Devoluciones — operaciones y tipos legacy para UI (legacy bridge / strangler fig).
 *
 * ARCH-01 seam para que la UI no importe `@/lib/database/returns`. Re-exporta
 * todo (funciones + tipos como `BoxReturnRow`, `ReturnDispatchTarget`).
 */
export * from '@/lib/database/returns';
