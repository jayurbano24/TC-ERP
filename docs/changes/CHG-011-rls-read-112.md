# CHG-011 — Migración 112 (SELECT RLS tablas de lectura)

| Campo | Valor |
|-------|-------|
| **Archivo** | `web/supabase/migrations/112_rls_read_user_facing_tables.sql` |
| **Fecha** | 2026-07-11 |

## Qué hace

Añade **solo SELECT** (authenticated) en tablas con RLS ON sin políticas que la app lee con JWT / `resolveReadClient`:

- Amplio: `clients`, `feature_flag`, `log_equipo`, `log_orden_servicio`, `service_order_operational_state`, `service_order_stage_summary`
- Ops: `sap_uploads`, `sap_validation_details|logs|sessions` (`admin` / `supervisor` / `gerencia` / `bodega` / receptores)

## A propósito sin policy (deny browser)

`audit_logs`, `kpi_event_ledger`, `kpi_invalidation_queue`, `outbox_event`, `sync_*` — solo service_role / DEFINER. El advisor seguirá mostrando INFO ahí.

## Apply

SQL Editor → pegar `112_rls_read_user_facing_tables.sql` → Run.
