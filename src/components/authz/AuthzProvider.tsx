'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { canDo as pureCanDo, canView as pureCanView, type UserAuthz } from '@/shared/authz/canDo';
import type { PermAction } from '@/shared/authz/modules';

/**
 * Capa de autorización del FRONTEND (Commit 6) — SOLO para experiencia de usuario.
 *
 * - Fuente única: el snapshot de permisos del propio usuario (`GET /api/authz/me`),
 *   sembrado con datos calculados en el servidor (layout) para EVITAR flicker.
 * - Cache: TanStack Query (`staleTime` 60s) → sin consultas innecesarias.
 * - NO es seguridad: toda acción se valida igualmente en el backend
 *   (roleGuard/endpoints/RLS). Aquí solo se decide qué mostrar/ocultar/deshabilitar.
 */

export const AUTHZ_QUERY_KEY = ['authz', 'me'] as const;

const EMPTY_AUTHZ: UserAuthz = {
  userId: '',
  roleId: null,
  roleLabel: null,
  isAdmin: false,
  perms: [],
  email: null,
};

export async function fetchAuthzMe(): Promise<UserAuthz> {
  const res = await fetch('/api/authz/me', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    // Fail-closed para UX: si no se puede resolver, no se asume ningún permiso.
    return EMPTY_AUTHZ;
  }
  return (await res.json()) as UserAuthz;
}

export interface AuthzApi {
  /** Snapshot crudo (no usar para seguridad). */
  snapshot: UserAuthz;
  isAdmin: boolean;
  /** Email de sesión (UX). */
  email: string | null;
  /** ¿Puede ejecutar `action` sobre `module`? */
  can: (module: string, action: PermAction) => boolean;
  /** Atajo de lectura (canDo(module,'view')). */
  canView: (module: string) => boolean;
  roleLabel: string | null;
  /** true mientras se resuelve por primera vez sin datos iniciales. */
  isLoading: boolean;
}

const AuthzContext = createContext<AuthzApi | null>(null);

export function AuthzProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Snapshot calculado en el servidor (evita flicker en el primer render). */
  initial?: UserAuthz | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: AUTHZ_QUERY_KEY,
    queryFn: fetchAuthzMe,
    initialData: initial ?? undefined,
    // Si el seed del layout no trae email, forzar refresh (gate Tema/Colores).
    initialDataUpdatedAt: initial?.email ? undefined : 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const snapshot = data ?? EMPTY_AUTHZ;

  const value = useMemo<AuthzApi>(
    () => ({
      snapshot,
      isAdmin: snapshot.isAdmin,
      email: snapshot.email ?? null,
      can: (module, action) => pureCanDo(snapshot, module, action),
      canView: (module) => pureCanView(snapshot, module),
      roleLabel: snapshot.roleLabel,
      isLoading: isLoading && !initial,
    }),
    [snapshot, isLoading, initial]
  );

  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>;
}

/** Hook único de autorización de UX. Lanza si se usa fuera del provider. */
export function useAuthz(): AuthzApi {
  const ctx = useContext(AuthzContext);
  if (!ctx) {
    throw new Error('useAuthz debe usarse dentro de <AuthzProvider>');
  }
  return ctx;
}

/** Variante segura que no lanza (devuelve null si no hay provider). */
export function useAuthzOptional(): AuthzApi | null {
  return useContext(AuthzContext);
}
