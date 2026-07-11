# CHG-009 — Cliente RLS por request (ALS + DI + reporting)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-07-11 |
| **Depende** | CHG-008 |
| **SQL** | Ninguno |

## Mecanismo

`getSupabaseServerClient()` respeta `AsyncLocalStorage`:

- Fuera de scope → service role (como antes)
- Dentro de `runWithSupabaseClient` / `withResolvedReadClient` → cliente de `resolveReadClient` (RLS si `USE_RLS_READS=true`)

El DI (`@inject('SupabaseClient')`) usa la misma factory → dashboards heredan el scope sin reescribir handlers.

## Rutas cableadas

- `/api/rrhh/dashboard`, `/api/produccion/dashboard`, `/api/despacho/pendientes`
- `/api/reports/catalog`, `/api/reports/[code]/export`
- `/api/recepcion/history/kpis`, `/api/v1/kpi/pipeline` (+ metrics ya con resolveReadClient)

## Activación

```bash
USE_RLS_READS=true   # staging primero
# AUTHZ_ENFORCE sigue false hasta observar [AUTHZ_LOGONLY]
```

## Pendiente

- Encender enforce tras smoke
- Legacy `user_roles.role_id NULL` (§11.7) — diferido
