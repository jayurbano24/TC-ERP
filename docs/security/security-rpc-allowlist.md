# Inventario RPC — categorías A / B / C

Fuente: `rg "\.rpc\('` en `web/src` (2026-07-18).  
Tratamiento según CHG-013 / plan Security Advisor.

| Cat | Significado | EXECUTE |
|-----|-------------|---------|
| **A** | Llamada desde app (browser o API con sesión/`service_role` de uso general) | `authenticated` + `service_role` |
| **B** | Solo server (`getSupabaseServerClient` / cron) | solo `service_role` |
| **C** | Trigger / helper interno / backfill | sin roles de API (`service_role` opcional) |

## Categoría A — cliente / ERP (mantener authenticated)

```
accessory_dispatch_out_tx
acquire_box_lock_tx
add_app_role_value
adjust_px_box_quantity_tx
app_can
audit_domain_events_stats
block_return_by_sap_transfer_tx
bodega_cancel_scan_tx
bodega_finalize_scan_tx
bodega_list_box_deletion_requests
bodega_request_box_deletion_tx
bodega_review_box_deletion_tx
bodega_start_or_append_scan_tx
capture_px_equipment_tx
classify_equipment_batch_tx
close_px_box_tx
create_or_get_sap_transfer_document
count_workshop_os_all_tabs
count_workshop_os_by_status
create_bodega_box_tx
create_recepcion_tx
delete_px_capture_box_tx
dispatch_batch_close_tx
dispatch_batch_open_tx
emit_domain_event
full_reception_return_tx
get_correlation_timeline
get_entity_timeline
get_next_recovery_order
join_or_start_px_reception_tx
next_box_code
next_equipment_reentry_count
next_outbound_code
next_salida_code
production_order_approve_tx
production_order_assign_os_tx
production_order_create_tx
promote_px_box_tx
refresh_service_order_operational_states
release_box_lock_tx
reopen_px_box_tx
upsert_cac_tray_unit_from_os
void_px_equipment_tx
warehouse_dashboard_kpis
warehouse_dispersion_tx
warehouse_get_box_history
warehouse_list_boxes_page
warehouse_list_in_progress_boxes
warehouse_list_partial_boxes
warehouse_salida_parcial_tx
warehouse_salida_tx
warehouse_stats_by_technology
warehouse_sync_sap_for_series
warehouse_traslado_parcial_tx
warehouse_traslado_tx
workshop_list_os_queue_page
```

Helpers RLS (también A): `app_has_role`, `app_is_admin`, `app_role_id`, `app_assert_*`, `app_can_manage_biometrics`.

## Categoría A-anon — allowlist sin sesión

```
zk_ingest_attlog_tx
kiosk_enroll_face_embeddings
kiosk_deactivate_face_embeddings
kiosk_log_face_recognition
kiosk_insert_time_log
```

## Categoría B — schema `internal` (migraciones 149–150)

Llamadas solo vía `getSupabaseServerClient()` + `rpcInternal()` / cron.

```
internal.sap_sync_tx
internal.sap_sync_matches_tx
internal.refresh_enterprise_summary_views
internal.close_open_attendance_tx
```

Dashboard: exponer schema `internal` en API settings (CHG-014).

## Categoría C — internos (migración 148/149)

Triggers (`*_tg`, `trg_*`), PIN helper, backfills y helpers no referenciados en `web/src`:

```
trg_series_service_order_guard
boxes_assign_box_code_tg
app_kiosk_biometric_pin
warehouse_log_movement_internal
px_log_activity
migrate_px_historical_bodega_tx
repair_cac_tray_metadata
repair_reentry_counts
backfill_cac_tray_units
audit_cac_domain_events_backfill_stats
audit_cac_tray_metadata
cac_backoffice_audit_to_domain_event
app_sync_operational_role_from_position
equipment_closed_cycle_count
series_active_service_order
finalize_px_reception_batch_tx
finalize_px_reception_prep_one_box_tx
finalize_px_reception_prep_tx
finalize_px_reception_tx
px_next_bodega_box_code
px_next_guide_number
next_production_order_number
next_cac_reception_code
next_dispatch_batch_number
warehouse_sync_sap_transfer_ingresado
sap_lookup_serial
px_is_serial_blocked_in_inventory
refresh_service_order_stage_summary
log_advanced_audit
cac_tray_resolve_sap_transfer
cac_backoffice_audit_log
```


(La lista C en SQL 149 usa `to_regprocedure` y omite firmas inexistentes.)

## Cómo regenerar categoría A

```bash
rg -o "\.rpc\(\s*'[^']+'" -g "*.ts" -g "*.tsx" src --no-filename | sort -u
```
