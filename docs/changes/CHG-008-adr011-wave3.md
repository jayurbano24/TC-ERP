# CHG-008 — ADR-011 oleada 3 (CAC + PX assert + lecturas)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-07-11 |
| **Depende** | CHG-007 (105–107) |

## SQL (orden)

1. `108_rpc_assert_px_reception.sql` — `app_assert` en RPCs PX  
2. `109_rls_read_cac_tray_reports.sql` — SELECT RLS en `cac_tray_units` / reportes  

## App (redeploy)

- Backoffice CAC: `tray/stats/export/transfer-eligible` → `requireApiUser` + `resolveReadClient`
- Reports export → sesión + roles producción
- KPI dashboard-metrics + audit series-history → `resolveReadClient`
- Reception history KPIs → `requireApiUser`

## Aún pendiente

- Inyectar cliente RLS en **providers** de reporting (hoy gate de sesión; DB sigue service role dentro del controller)
- DI dashboards RRHH/producción (singleton service role)
- `AUTHZ_ENFORCE=true` / `app.enforce_rpc_roles=on` tras smoke
- Borrar legacy `user_roles.role_id NULL` (§11.7)

## Flags

Siguen **off** por defecto: `USE_RLS_READS`, `AUTHZ_ENFORCE`.
