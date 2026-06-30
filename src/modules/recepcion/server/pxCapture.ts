/**
 * Recepción PX — operaciones server-side de captura incremental (legacy bridge).
 *
 * ARCH-01 seam para las API routes: re-exporta las operaciones de
 * `@/lib/database/pxReceptionCapture` (que usan el cliente *server* de Supabase)
 * para que `src/app/api/**` no importe `@/lib/database` directamente.
 */
export * from '@/lib/database/pxReceptionCapture';
