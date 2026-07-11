# CHG-007 — ADR-011 oleada completa (2A–2D + datos)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-07-11 |
| **Estado** | Código listo; aplicar SQL 105→107; flags enforce **siguen off** |
| **Depende** | CHG-006 (102–104 aplicados) |

## Aplicar en SQL Editor (orden)

1. `105_rls_phase_b_remaining_tables.sql` (idempotente; salta tablas ausentes p. ej. `activity_costs`)
2. `106_rpc_assert_warehouse_revoke_helpers.sql`
3. `107_user_roles_operational_sync.sql` (si ya corrió con `roles_inserted=6`, no hace falta repetir)

Post-107:

```sql
SELECT * FROM public.v_user_roles_authz_gaps WHERE NOT has_operational_role;
```

## Qué entrega este CHG

| Fase | Entrega |
|------|---------|
| **2A** | Flag `USE_RLS_READS` + `resolveReadClient`; GETs: `recepcion/history`, `sap/{history,dashboard,query,tc-series}` |
| **2B** | RLS en production_orders, dispatch_batches, px_*, accessories*, activity_costs, erp_audit_logs; quita política de prueba KPI |
| **2C** | `ICLOCK_DEVICE_SECRET` (opt-in; sin env = legacy); `requireServerAdmin` en admin actions |
| **2D** | `app_assert` en warehouse/dispatch RPCs; revoke helpers internos |
| **Datos** | Vista gaps + `app_sync_operational_role_from_position` (no borra legacy) |
| **Enforce** | **Sigue off** — ver activación abajo |

## Flags (Vercel / `.env`)

```bash
# Lecturas RLS (probar primero en staging)
USE_RLS_READS=false

# Bloqueo HTTP por rol (tras observar [AUTHZ_LOGONLY] deny)
AUTHZ_ENFORCE=false

# Secreto relojes ZK (solo cuando el proxy/reloj pueda enviarlo)
# ICLOCK_DEVICE_SECRET=...
# Reloj: query ?device_key=... o header X-ICLOCK-SECRET
```

RPC enforce (Postgres, tras observar WARNINGs):

```sql
ALTER ROLE authenticator SET app.enforce_rpc_roles = 'on';
-- rollback: ALTER ROLE authenticator RESET app.enforce_rpc_roles;
```

## Aún pendiente (siguiente oleada)

- DI dashboards / reports providers → cliente por request con `USE_RLS_READS`
- backoffice CAC stats/export/transfer-eligible (tray ya exige sesión)
- `app_assert` en PX `*_tx` (hoy service_role + roleGuard HTTP)
- Activar `AUTHZ_ENFORCE` / `app.enforce_rpc_roles` tras smoke + 0 denies legítimos
- Borrar filas legacy `role_id NULL` (§11.7) — **sigue diferido**

## Smoke checklist

- [ ] Despacho / bodega rack / recepción PX
- [ ] Devolución SAP
- [ ] Admin cambio password (no-admin → error)
- [ ] iclock sin secret → OK; con secret mal → 401
- [ ] `SELECT * FROM v_user_roles_authz_gaps WHERE NOT has_operational_role`
