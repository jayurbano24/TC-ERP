-- =============================================================================
-- 149 — Security Advisor: REVOKE authenticated en RPCs B/C (Fase 2)
-- =============================================================================
-- Categoría B: solo service_role (SAP sync, refresh MVs).
-- Categoría C: triggers / helpers / backfills no llamados desde web/src .rpc() A.
-- Inventario: docs/security/security-rpc-allowlist.md
-- =============================================================================

DO $$
DECLARE
  r record;
  -- Nombres categoría B + C (todas las sobrecargas DEFINER en public)
  v_names text[] := ARRAY[
    -- B: solo server
    'sap_sync_tx',
    'sap_sync_matches_tx',
    'refresh_enterprise_summary_views',
    -- C: triggers / internos
    'trg_series_service_order_guard',
    'boxes_assign_box_code_tg',
    'app_kiosk_biometric_pin',
    'warehouse_log_movement_internal',
    'px_log_activity',
    'migrate_px_historical_bodega_tx',
    'repair_cac_tray_metadata',
    'repair_reentry_counts',
    'backfill_cac_tray_units',
    'audit_cac_domain_events_backfill_stats',
    'audit_cac_tray_metadata',
    'cac_backoffice_audit_to_domain_event',
    'app_sync_operational_role_from_position',
    'equipment_closed_cycle_count',
    'series_active_service_order',
    'finalize_px_reception_batch_tx',
    'finalize_px_reception_prep_one_box_tx',
    'finalize_px_reception_prep_tx',
    'finalize_px_reception_tx',
    'px_next_bodega_box_code',
    'px_next_guide_number',
    'next_production_order_number',
    'next_cac_reception_code',
    'next_dispatch_batch_number',
    'warehouse_sync_sap_transfer_ingresado',
    'sap_lookup_serial',
    'px_is_serial_blocked_in_inventory',
    'refresh_service_order_stage_summary',
    'log_advanced_audit',
    'cac_tray_resolve_sap_transfer',
    'create_or_get_sap_transfer_document',
    'cac_backoffice_audit_log'
  ];
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname = ANY (v_names)
  LOOP
    BEGIN
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
      RAISE NOTICE '149: revoked authenticated on %.%(%)', 'public', r.name, r.args;
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE '149: skip undefined %.%(%)', 'public', r.name, r.args;
    END;
  END LOOP;
END $$;

-- Allowlist anon (ZK + kiosco) — reafirmar tras revokes
DO $$
BEGIN
  IF to_regprocedure('public.zk_ingest_attlog_tx(text, jsonb)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.zk_ingest_attlog_tx(text, jsonb) TO anon, service_role;
  END IF;
  IF to_regprocedure('public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_enroll_face_embeddings(uuid, text, jsonb, text)
      TO anon, authenticated, service_role;
  END IF;
  IF to_regprocedure('public.kiosk_deactivate_face_embeddings(uuid, text, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_deactivate_face_embeddings(uuid, text, text)
      TO anon, authenticated, service_role;
  END IF;
  IF to_regprocedure('public.kiosk_log_face_recognition(jsonb, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.kiosk_log_face_recognition(jsonb, text)
      TO anon, authenticated, service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
