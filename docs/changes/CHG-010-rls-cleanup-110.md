# CHG-010 — Migración 110 (cleanup advisor RLS)

| Campo | Valor |
|-------|-------|
| **Archivo** | `web/supabase/migrations/110_rls_cleanup_legacy_policies.sql` |
| **Fecha** | 2026-07-11 |

## Qué hace

1. **DROP** políticas `USING(true)` / `WITH CHECK(true)` listadas por el advisor (catálogos, HR, reception_guides legacy, service_orders “Permitir todo”, return_registry, report_runs_auth, time_*, kpi_alerts, cat_reacondicionado_*).
2. **Reemplazo**: SELECT autenticado + escritura `app_is_admin` / roles operacionales.
3. **Avatars**: elimina `avatars_public_select` (cierra listing); URLs públicas del bucket siguen OK.
4. **REVOKE anon** en `app_assert_*` y `app_sync_*` (sync solo `service_role`).

## No cubre (a propósito)

- WARN `authenticated` + `*_tx` DEFINER → modelo de negocio (browser/API).
- `zk_ingest_attlog_tx` para `anon` → dispositivos.
- **Leaked password protection** → Dashboard Auth (manual).
- ERROR vista `v_user_roles_authz_gaps` DEFINER → **111** (`111_view_authz_gaps_security_invoker.sql`).

## Apply

SQL Editor → pegar `110_rls_cleanup_legacy_policies.sql` → Run.

## Smoke

- Catálogos (marcas/modelos) lectura OK; escritura solo admin/supervisor.
- Recepción / OS / guías (políticas 103 intactas).
- Kiosko marcaciones (INSERT time_logs con sesión).
- Avatar: carga/visualización por URL pública.
