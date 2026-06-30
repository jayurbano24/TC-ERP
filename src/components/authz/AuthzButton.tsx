'use client';

import React from 'react';
import { Button } from '@/components/ui';
import { useAuthz } from './AuthzProvider';
import type { PermAction } from '@/shared/authz/modules';

type BaseButtonProps = React.ComponentProps<typeof Button>;

export interface AuthzButtonProps extends BaseButtonProps {
  /** Módulo de `erp_role_permissions` (p. ej. 'Despacho', 'Bodega'). */
  module: string;
  /** Acción requerida (default 'view'). */
  action?: PermAction;
  /**
   * 'hide' (default): no se renderiza si no está autorizado.
   * 'disable': se muestra deshabilitado (el usuario lo ve pero no puede ejecutarlo).
   */
  authzMode?: 'hide' | 'disable';
}

/**
 * Botón con autorización de UX incorporada. Centraliza el gating para no
 * duplicarlo en cada pantalla. NO sustituye la validación del backend.
 */
export function AuthzButton({
  module,
  action = 'view',
  authzMode = 'hide',
  disabled,
  title,
  ...rest
}: AuthzButtonProps) {
  const { can } = useAuthz();
  const allowed = can(module, action);

  if (!allowed && authzMode === 'hide') return null;

  const blocked = !allowed;
  return (
    <Button
      {...rest}
      disabled={disabled || blocked}
      aria-disabled={blocked || undefined}
      title={blocked ? 'No tienes permiso para esta acción' : title}
    />
  );
}
