# CHG-006 — Seguridad fase A (Dashboard + higiene + RLS + RPC)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-07-11 |
| **Estado** | Listo para aplicar en SQL Editor (orden 102 → 103 → 104) |
| **ADR** | ADR-011 |

## Paso 1 — Dashboard (manual)

1. **Leaked password protection**  
   Supabase Dashboard → Authentication → Providers → Email → activar *Leaked password protection*.
2. **Avatars**  
   Cubierto por migración `102` (SELECT público; escrituras solo en `{uid}/…`). Tras aplicar 102, redesplegar app para el path de upload.

## Paso 2 — Migración `102`

Archivo: `web/supabase/migrations/102_security_hygiene_extensions_anon_avatars.sql`

- `pg_trgm` → schema `extensions`
- `REVOKE EXECUTE … FROM anon` en todos los `SECURITY DEFINER`; **re-GRANT** solo `zk_ingest_attlog_tx` a `anon`
- `REVOKE` de `app_has_role` a `anon`
- Políticas storage `avatars` endurecidas

## Paso 3 — Migración `103` (RLS fase A)

Archivo: `web/supabase/migrations/103_rls_phase_a_critical_writes.sql`

Elimina `*_auth_fallback` / políticas `USING(true)` de escritura en:

`series`, `service_orders`, `reception_guides`, `boxes`, `box_series`, `sap_transfer_documents`, `warehouse_movements`

Deja **SELECT** a `authenticated` y escrituras con `app_is_admin()` / `app_has_role(...)`.

**Antes de aplicar:** confirmar que operadores activos tienen filas en `user_roles.role` (enum operacional: `admin`, `supervisor`, `bodega`, etc.). Usuarios solo con puesto RRHH (p. ej. `BACKOFFICES`) **dejarán de escribir** vía cliente browser hasta asignar rol operacional.

**Smoke post-apply:** despacho (mover serie a caja), bodega (rack), recepción tablet, devolución bloque SAP.

## Paso 4 — Migración `104` + borde HTTP

Archivo: `web/supabase/migrations/104_rpc_assert_roles_returns.sql`

- Helper `app_assert_any_role(...)` (log-only; enforce con `app.enforce_rpc_roles=on`)
- Primer CHG en RPCs de browser JWT: `block_return_by_sap_transfer_tx`, `full_reception_return_tx` (roles `admin`/`supervisor`)

**Siguiente oleada (no en este CHG):** `warehouse_*_tx`, `create_bodega_box_tx`, `dispatch_batch_*_tx` (mismo helper; roles bodega).

**Borde HTTP:** `ROLES_RETURNS_SAP` / `ROLES_BODEGA_DESPACHO` en sync SAP y lecturas bodega (stats/export). Enforce app sigue con `AUTHZ_ENFORCE=true` (default off).

## Orden de apply

```text
102 → 103 → 104
```

## Rollback

Cada migración incluye bloque `DOWN` comentado. Para RPC: redeploy cuerpo previo de 033/031 sin `app_assert_any_role`.
