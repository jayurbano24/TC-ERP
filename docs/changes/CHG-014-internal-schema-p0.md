# CHG-014 — Schema `internal` P0 + allowlist authenticated

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-07-18 |
| **Migraciones** | `150_internal_schema_p0_rpcs.sql`, `151_definer_authenticated_allowlist_only.sql` |
| **Código** | `rpcInternal`, callers SAP/cron |

## Qué hace

### 150
- Crea schema `internal` (sin grants a `anon` / `authenticated`).
- Mueve: `sap_sync_tx`, `sap_sync_matches_tx`, `refresh_enterprise_summary_views`.
- EXECUTE solo `service_role`.

### 151
- Revoca `EXECUTE` de `authenticated` en **todos** los `SECURITY DEFINER` de `public`.
- Re-concede solo allowlist A + helpers RLS + kiosco (ver `docs/security/security-rpc-allowlist.md`).

### App
- `web/src/lib/supabase/rpcInternal.ts`
- Rutas `/api/sap/sync`, `/api/sap/sync-matches`, `/api/internal/refresh-summary-views`
- `kpi-sync` pipeline WIP

## Dashboard (obligatorio tras 150)

1. **Project Settings → API → Exposed schemas**
2. Añadir `internal` (mantener `public`).
3. Guardar → PostgREST recarga.

Sin este paso, `rpcInternal` falla con `PGRST106` (schema not exposed).

`anon`/`authenticated` siguen sin `EXECUTE` en `internal.*`; solo la service role puede invocarlos.

## Orden de apply

1. SQL **150**
2. Exponer schema `internal` en Dashboard
3. SQL **151**
4. Deploy app (callers `rpcInternal`)
5. Security Advisor + smoke SAP sync / cron refresh

## Smoke

- [ ] `POST /api/sap/sync` (o sync-matches) OK
- [ ] Cron refresh-summary-views OK
- [ ] Bodega / PX / kiosco sin regresión (allowlist A)
