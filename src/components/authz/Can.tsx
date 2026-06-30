'use client';

import type { ReactNode } from 'react';
import { useAuthz } from './AuthzProvider';
import type { PermAction } from '@/shared/authz/modules';

/**
 * Renderiza `children` solo si el usuario puede `action` sobre `module`.
 *
 * - `mode="hide"` (default): si no está autorizado, no se muestra (o muestra `fallback`).
 *   Úsalo cuando el usuario NUNCA debe conocer la existencia de la acción.
 * - `mode="disable"`: muestra el contenido pero inerte (no clickable, atenuado).
 *   Úsalo cuando SÍ puede verlo pero no ejecutarlo.
 *
 * Solo UX: el backend valida igualmente.
 */
export function Can({
  module,
  action = 'view',
  mode = 'hide',
  fallback = null,
  children,
}: {
  module: string;
  action?: PermAction;
  mode?: 'hide' | 'disable';
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can } = useAuthz();
  const allowed = can(module, action);

  if (allowed) return <>{children}</>;
  if (mode === 'hide') return <>{fallback}</>;

  return (
    <span
      aria-disabled="true"
      title="No tienes permiso para esta acción"
      className="opacity-50 pointer-events-none select-none"
    >
      {children}
    </span>
  );
}

/** Hook de conveniencia para decisiones puntuales en JSX/efectos de UX. */
export function useCan(module: string, action: PermAction = 'view'): boolean {
  const { can } = useAuthz();
  return can(module, action);
}
