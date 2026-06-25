'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Provider de TanStack Query (C6).
 *
 * Defaults orientados a reducir egress de Supabase:
 * - `staleTime` 30s: dentro de esa ventana NO se re-consulta al re-montar/navegar
 *   (mata los refetch en cascada que dispara el patrón useEffect+useState).
 * - `refetchOnWindowFocus: false`: evita re-consultar cada vez que la pestaña
 *   recupera el foco.
 * - `retry: 1`: un solo reintento (los errores de negocio no deben martillar la API).
 *
 * El QueryClient se crea con useState para que sea estable por montaje del árbol
 * y no se comparta entre requests en SSR.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
