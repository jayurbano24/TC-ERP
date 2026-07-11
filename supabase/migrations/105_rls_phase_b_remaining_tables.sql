-- =============================================================================
-- 105 — RLS fase B: resto tablas operativas (ADR-011 2B)
-- =============================================================================
-- Idempotente y tolerante a tablas ausentes (p. ej. activity_costs no desplegada).
-- SELECT autenticado; escritura por rol o solo vía RPC.
-- Quita política de prueba en taller_kpi_goals (si existe).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- production_orders
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.production_orders') IS NULL THEN
    RAISE NOTICE '105: skip production_orders (no existe)';
    RETURN;
  END IF;
  ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS production_orders_auth ON public.production_orders;
  DROP POLICY IF EXISTS production_orders_read_auth ON public.production_orders;
  DROP POLICY IF EXISTS production_orders_write_ops ON public.production_orders;
  CREATE POLICY production_orders_read_auth ON public.production_orders
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY production_orders_write_ops ON public.production_orders
    FOR ALL TO authenticated
    USING (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('gerencia')
    )
    WITH CHECK (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('gerencia')
    );
END $$;

-- ---------------------------------------------------------------------------
-- dispatch_batches
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.dispatch_batches') IS NULL THEN
    RAISE NOTICE '105: skip dispatch_batches (no existe)';
    RETURN;
  END IF;
  ALTER TABLE public.dispatch_batches ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS dispatch_batches_auth ON public.dispatch_batches;
  DROP POLICY IF EXISTS dispatch_batches_read_auth ON public.dispatch_batches;
  DROP POLICY IF EXISTS dispatch_batches_write_ops ON public.dispatch_batches;
  CREATE POLICY dispatch_batches_read_auth ON public.dispatch_batches
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY dispatch_batches_write_ops ON public.dispatch_batches
    FOR ALL TO authenticated
    USING (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('bodega')
    )
    WITH CHECK (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('bodega')
    );
END $$;

-- ---------------------------------------------------------------------------
-- px_reception_* / px_capture_metrics
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.px_reception_lots') IS NOT NULL THEN
    ALTER TABLE public.px_reception_lots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS px_lots_auth ON public.px_reception_lots;
    DROP POLICY IF EXISTS px_reception_lots_read_auth ON public.px_reception_lots;
    CREATE POLICY px_reception_lots_read_auth ON public.px_reception_lots
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
    ALTER TABLE public.px_reception_equipment ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS px_equipment_auth ON public.px_reception_equipment;
    DROP POLICY IF EXISTS px_reception_equipment_read_auth ON public.px_reception_equipment;
    CREATE POLICY px_reception_equipment_read_auth ON public.px_reception_equipment
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF to_regclass('public.px_reception_serial_lines') IS NOT NULL THEN
    ALTER TABLE public.px_reception_serial_lines ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS px_serial_lines_auth ON public.px_reception_serial_lines;
    DROP POLICY IF EXISTS px_reception_serial_lines_read_auth ON public.px_reception_serial_lines;
    CREATE POLICY px_reception_serial_lines_read_auth ON public.px_reception_serial_lines
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF to_regclass('public.px_reception_activity') IS NOT NULL THEN
    ALTER TABLE public.px_reception_activity ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS px_activity_auth ON public.px_reception_activity;
    DROP POLICY IF EXISTS px_reception_activity_read_auth ON public.px_reception_activity;
    CREATE POLICY px_reception_activity_read_auth ON public.px_reception_activity
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF to_regclass('public.px_capture_metrics') IS NOT NULL THEN
    ALTER TABLE public.px_capture_metrics ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS px_metrics_auth ON public.px_capture_metrics;
    DROP POLICY IF EXISTS px_capture_metrics_auth ON public.px_capture_metrics;
    DROP POLICY IF EXISTS px_capture_metrics_read_auth ON public.px_capture_metrics;
    CREATE POLICY px_capture_metrics_read_auth ON public.px_capture_metrics
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- accessories*
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.accessories') IS NOT NULL THEN
    ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow authenticated users to read accessories" ON public.accessories;
    DROP POLICY IF EXISTS "Allow authenticated users to insert accessories" ON public.accessories;
    DROP POLICY IF EXISTS "Allow authenticated users to update accessories" ON public.accessories;
    DROP POLICY IF EXISTS accessories_read_auth ON public.accessories;
    DROP POLICY IF EXISTS accessories_write_ops ON public.accessories;
    CREATE POLICY accessories_read_auth ON public.accessories
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY accessories_write_ops ON public.accessories
      FOR ALL TO authenticated
      USING (
        public.app_is_admin()
        OR public.app_has_role('admin')
        OR public.app_has_role('supervisor')
        OR public.app_has_role('bodega')
        OR public.app_has_role('receptor_px')
        OR public.app_has_role('receptor_cac')
      )
      WITH CHECK (
        public.app_is_admin()
        OR public.app_has_role('admin')
        OR public.app_has_role('supervisor')
        OR public.app_has_role('bodega')
        OR public.app_has_role('receptor_px')
        OR public.app_has_role('receptor_cac')
      );
  END IF;

  IF to_regclass('public.accessory_boxes') IS NOT NULL THEN
    ALTER TABLE public.accessory_boxes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow authenticated users to read accessory_boxes" ON public.accessory_boxes;
    DROP POLICY IF EXISTS "Allow authenticated users to insert accessory_boxes" ON public.accessory_boxes;
    DROP POLICY IF EXISTS "Allow authenticated users to update accessory_boxes" ON public.accessory_boxes;
    DROP POLICY IF EXISTS "Allow authenticated users to delete accessory_boxes" ON public.accessory_boxes;
    DROP POLICY IF EXISTS accessory_boxes_read_auth ON public.accessory_boxes;
    DROP POLICY IF EXISTS accessory_boxes_write_ops ON public.accessory_boxes;
    CREATE POLICY accessory_boxes_read_auth ON public.accessory_boxes
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY accessory_boxes_write_ops ON public.accessory_boxes
      FOR ALL TO authenticated
      USING (
        public.app_is_admin()
        OR public.app_has_role('admin')
        OR public.app_has_role('supervisor')
        OR public.app_has_role('bodega')
      )
      WITH CHECK (
        public.app_is_admin()
        OR public.app_has_role('admin')
        OR public.app_has_role('supervisor')
        OR public.app_has_role('bodega')
      );
  END IF;

  IF to_regclass('public.accessory_movements') IS NOT NULL THEN
    ALTER TABLE public.accessory_movements ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow authenticated users to read accessory movements" ON public.accessory_movements;
    DROP POLICY IF EXISTS "Allow authenticated users to insert accessory movements" ON public.accessory_movements;
    DROP POLICY IF EXISTS accessory_movements_read_auth ON public.accessory_movements;
    DROP POLICY IF EXISTS accessory_movements_write_ops ON public.accessory_movements;
    CREATE POLICY accessory_movements_read_auth ON public.accessory_movements
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY accessory_movements_write_ops ON public.accessory_movements
      FOR INSERT TO authenticated
      WITH CHECK (
        public.app_is_admin()
        OR public.app_has_role('admin')
        OR public.app_has_role('supervisor')
        OR public.app_has_role('bodega')
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- activity_costs (opcional — puede no existir en prod)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.activity_costs') IS NULL THEN
    RAISE NOTICE '105: skip activity_costs (no existe)';
    RETURN;
  END IF;
  ALTER TABLE public.activity_costs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Permitir select en activity_costs para todos" ON public.activity_costs;
  DROP POLICY IF EXISTS "Permitir insert en activity_costs para todos" ON public.activity_costs;
  DROP POLICY IF EXISTS "Permitir update en activity_costs para todos" ON public.activity_costs;
  DROP POLICY IF EXISTS "Permitir delete en activity_costs para todos" ON public.activity_costs;
  DROP POLICY IF EXISTS activity_costs_read_auth ON public.activity_costs;
  DROP POLICY IF EXISTS activity_costs_write_ops ON public.activity_costs;
  CREATE POLICY activity_costs_read_auth ON public.activity_costs
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY activity_costs_write_ops ON public.activity_costs
    FOR ALL TO authenticated
    USING (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('gerencia')
    )
    WITH CHECK (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('gerencia')
    );
END $$;

-- ---------------------------------------------------------------------------
-- erp_audit_logs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.erp_audit_logs') IS NULL THEN
    RAISE NOTICE '105: skip erp_audit_logs (no existe)';
    RETURN;
  END IF;
  ALTER TABLE public.erp_audit_logs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Permitir insert a usuarios autenticados" ON public.erp_audit_logs;
  DROP POLICY IF EXISTS "Permitir select a todos" ON public.erp_audit_logs;
  DROP POLICY IF EXISTS erp_audit_logs_insert_auth ON public.erp_audit_logs;
  DROP POLICY IF EXISTS erp_audit_logs_read_ops ON public.erp_audit_logs;
  CREATE POLICY erp_audit_logs_insert_auth ON public.erp_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY erp_audit_logs_read_ops ON public.erp_audit_logs
    FOR SELECT TO authenticated
    USING (
      public.app_is_admin()
      OR public.app_has_role('admin')
      OR public.app_has_role('supervisor')
      OR public.app_has_role('gerencia')
    );
END $$;

-- ---------------------------------------------------------------------------
-- taller_kpi_goals — eliminar política de prueba
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.taller_kpi_goals') IS NULL THEN
    RAISE NOTICE '105: skip taller_kpi_goals (no existe)';
    RETURN;
  END IF;
  ALTER TABLE public.taller_kpi_goals ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Permitir upsert temporal de metas a todos para pruebas" ON public.taller_kpi_goals;
END $$;

NOTIFY pgrst, 'reload schema';
