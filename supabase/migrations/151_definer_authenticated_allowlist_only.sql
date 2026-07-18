-- =============================================================================
-- 151 — Fase 3: EXECUTE authenticated SOLO allowlist A (+ helpers RLS)
-- =============================================================================
-- 1) REVOKE authenticated en TODO SECURITY DEFINER de public
-- 2) GRANT authenticated solo a categoría A + helpers RLS + kiosco (también anon)
-- Cierra huecos que 148/149 no cubrieron (DEFINER nuevos / re-grants).
-- Inventario: docs/security/security-rpc-allowlist.md
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated',
        r.name,
        r.args
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Allowlist: nombres categoría A + helpers RLS
DO $$
DECLARE
  r record;
  v_allow text[] := ARRAY[
    -- Categoría A (web/src .rpc)
    'accessory_dispatch_out_tx',
    'acquire_box_lock_tx',
    'add_app_role_value',
    'adjust_px_box_quantity_tx',
    'app_can',
    'audit_domain_events_stats',
    'block_return_by_sap_transfer_tx',
    'bodega_cancel_scan_tx',
    'bodega_finalize_scan_tx',
    'bodega_list_box_deletion_requests',
    'bodega_request_box_deletion_tx',
    'bodega_review_box_deletion_tx',
    'bodega_start_or_append_scan_tx',
    'capture_px_equipment_tx',
    'classify_equipment_batch_tx',
    'close_px_box_tx',
    'count_workshop_os_all_tabs',
    'count_workshop_os_by_status',
    'create_bodega_box_tx',
    'create_recepcion_tx',
    'delete_px_capture_box_tx',
    'dispatch_batch_close_tx',
    'dispatch_batch_open_tx',
    'emit_domain_event',
    'full_reception_return_tx',
    'get_correlation_timeline',
    'get_entity_timeline',
    'get_next_recovery_order',
    'join_or_start_px_reception_tx',
    'next_box_code',
    'next_equipment_reentry_count',
    'next_outbound_code',
    'next_salida_code',
    'production_order_approve_tx',
    'production_order_assign_os_tx',
    'production_order_create_tx',
    'promote_px_box_tx',
    'refresh_service_order_operational_states',
    'release_box_lock_tx',
    'reopen_px_box_tx',
    'upsert_cac_tray_unit_from_os',
    'void_px_equipment_tx',
    'warehouse_dashboard_kpis',
    'warehouse_dispersion_tx',
    'warehouse_get_box_history',
    'warehouse_list_boxes_page',
    'warehouse_list_in_progress_boxes',
    'warehouse_list_partial_boxes',
    'warehouse_salida_parcial_tx',
    'warehouse_salida_tx',
    'warehouse_stats_by_technology',
    'warehouse_sync_sap_for_series',
    'warehouse_traslado_parcial_tx',
    'warehouse_traslado_tx',
    'workshop_list_os_queue_page',
    -- Kiosco (también grant anon aparte)
    'kiosk_enroll_face_embeddings',
    'kiosk_deactivate_face_embeddings',
    'kiosk_log_face_recognition',
    -- Helpers RLS / assert (policies + RPC internos)
    'app_has_role',
    'app_is_admin',
    'app_role_id',
    'app_has_permission',
    'app_can_manage_biometrics',
    'app_assert_any_role',
    'app_assert_bodega',
    'app_assert_recepcion',
    'app_gerente_general_user_ids'
  ];
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname = ANY (v_allow)
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      r.name,
      r.args
    );
  END LOOP;
END $$;

-- Allowlist anon (ZK + kiosco)
DO $$
BEGIN
  IF to_regprocedure('public.zk_ingest_attlog_tx(text, jsonb)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.zk_ingest_attlog_tx(text, jsonb) TO anon, service_role;
  END IF;
  IF to_regprocedure('public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text) TO anon;
  END IF;
  IF to_regprocedure('public.kiosk_deactivate_face_embeddings(uuid, text, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_deactivate_face_embeddings(uuid, text, text) TO anon;
  END IF;
  IF to_regprocedure('public.kiosk_log_face_recognition(jsonb, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_log_face_recognition(jsonb, text) TO anon;
  END IF;
END $$;

-- Triggers: sin authenticated (refuerzo)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proname LIKE '%\_tg' ESCAPE '\'
        OR p.proname LIKE 'trg\_%' ESCAPE '\'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      r.name,
      r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.name,
      r.args
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
