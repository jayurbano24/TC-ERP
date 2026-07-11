-- =============================================================================
-- 103 — RLS fase A: escrituras críticas por rol (ADR-011 §2B / §11.6)
-- =============================================================================
-- Problema: políticas *_auth_fallback / USING(true) anulan (OR) las write_ops.
-- Acción: SELECT amplio para autenticados; INSERT/UPDATE/DELETE por app_has_role
--         (+ app_is_admin). Eliminar fallbacks permisivos.
--
-- Tablas: series, service_orders, reception_guides, boxes, box_series,
--         sap_transfer_documents, warehouse_movements.
--
-- Riesgo: usuarios sin rol operacional enum (solo puesto RRHH) dejan de escribir
--         vía PostgREST/browser. RPCs SECURITY DEFINER (service_role) no se afectan.
--         Verificar user_roles.role antes de aplicar en prod.
-- Reversible: bloque DOWN al final.
-- =============================================================================

-- Helper predicado (roles operacionales de negocio + admin por puesto)
-- Usado inline en políticas para claridad / grep.

-- ---------------------------------------------------------------------------
-- series
-- ---------------------------------------------------------------------------
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS series_auth_fallback ON public.series;
DROP POLICY IF EXISTS series_read_auth ON public.series;
DROP POLICY IF EXISTS series_write_ops ON public.series;
DROP POLICY IF EXISTS "Permitir todo en series" ON public.series;

CREATE POLICY series_read_auth ON public.series
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY series_write_ops ON public.series
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
    OR public.app_has_role('tecnico')
    OR public.app_has_role('qc')
  );

CREATE POLICY series_update_ops ON public.series
  FOR UPDATE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
    OR public.app_has_role('tecnico')
    OR public.app_has_role('qc')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
    OR public.app_has_role('tecnico')
    OR public.app_has_role('qc')
  );

CREATE POLICY series_delete_ops ON public.series
  FOR DELETE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
  );

-- ---------------------------------------------------------------------------
-- service_orders
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_orders_auth_fallback ON public.service_orders;
DROP POLICY IF EXISTS service_orders_read_auth ON public.service_orders;
DROP POLICY IF EXISTS service_orders_write_ops ON public.service_orders;

CREATE POLICY service_orders_read_auth ON public.service_orders
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY service_orders_write_ops ON public.service_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('tecnico')
    OR public.app_has_role('qc')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  );

CREATE POLICY service_orders_update_ops ON public.service_orders
  FOR UPDATE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('tecnico')
    OR public.app_has_role('qc')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('tecnico')
    OR public.app_has_role('qc')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  );

CREATE POLICY service_orders_delete_ops ON public.service_orders
  FOR DELETE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
  );

-- ---------------------------------------------------------------------------
-- reception_guides
-- ---------------------------------------------------------------------------
ALTER TABLE public.reception_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reception_guides_auth_fallback ON public.reception_guides;
DROP POLICY IF EXISTS reception_guides_read_auth ON public.reception_guides;
DROP POLICY IF EXISTS reception_guides_write_ops ON public.reception_guides;

CREATE POLICY reception_guides_read_auth ON public.reception_guides
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY reception_guides_write_ops ON public.reception_guides
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  );

CREATE POLICY reception_guides_update_ops ON public.reception_guides
  FOR UPDATE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  );

CREATE POLICY reception_guides_delete_ops ON public.reception_guides
  FOR DELETE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
  );

-- ---------------------------------------------------------------------------
-- boxes
-- ---------------------------------------------------------------------------
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boxes_auth_fallback ON public.boxes;
DROP POLICY IF EXISTS boxes_read_auth ON public.boxes;
DROP POLICY IF EXISTS boxes_write_ops ON public.boxes;

CREATE POLICY boxes_read_auth ON public.boxes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY boxes_write_ops ON public.boxes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('bodega')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  );

CREATE POLICY boxes_update_ops ON public.boxes
  FOR UPDATE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('bodega')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('bodega')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  );

CREATE POLICY boxes_delete_ops ON public.boxes
  FOR DELETE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('bodega')
    OR public.app_has_role('receptor_px')
  );

-- ---------------------------------------------------------------------------
-- box_series
-- ---------------------------------------------------------------------------
ALTER TABLE public.box_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS box_series_auth_fallback ON public.box_series;
DROP POLICY IF EXISTS box_series_read_auth ON public.box_series;
DROP POLICY IF EXISTS box_series_write_ops ON public.box_series;

CREATE POLICY box_series_read_auth ON public.box_series
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY box_series_write_ops ON public.box_series
  FOR ALL TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('bodega')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('bodega')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  );

-- ---------------------------------------------------------------------------
-- sap_transfer_documents — quitar insert/update "auth" permisivos (027)
-- ---------------------------------------------------------------------------
ALTER TABLE public.sap_transfer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sap_transfer_documents_auth_fallback ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_insert_auth ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_update_auth ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_read_auth ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_select_auth ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_write_ops ON public.sap_transfer_documents;

CREATE POLICY sap_transfer_documents_select_auth ON public.sap_transfer_documents
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY sap_transfer_documents_write_ops ON public.sap_transfer_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  );

CREATE POLICY sap_transfer_documents_update_ops ON public.sap_transfer_documents
  FOR UPDATE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('gerencia')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
    OR public.app_has_role('bodega')
  );

CREATE POLICY sap_transfer_documents_delete_ops ON public.sap_transfer_documents
  FOR DELETE TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
  );

-- ---------------------------------------------------------------------------
-- warehouse_movements — lectura ok; escritura solo vía RPC DEFINER
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warehouse_movements_auth ON public.warehouse_movements;
DROP POLICY IF EXISTS warehouse_movements_read_auth ON public.warehouse_movements;
DROP POLICY IF EXISTS warehouse_movements_write_ops ON public.warehouse_movements;

CREATE POLICY warehouse_movements_read_auth ON public.warehouse_movements
  FOR SELECT TO authenticated
  USING (true);

-- Sin políticas INSERT/UPDATE/DELETE para authenticated → denegado por defecto.
-- service_role y SECURITY DEFINER siguen escribiendo.

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOWN (rollback) — recrear fallbacks permisivos (NO usar en prod salvo emergencia):
-- -----------------------------------------------------------------------------
-- drop policy if exists series_read_auth on public.series;
-- drop policy if exists series_write_ops on public.series;
-- drop policy if exists series_update_ops on public.series;
-- drop policy if exists series_delete_ops on public.series;
-- create policy series_auth_fallback on public.series for all to authenticated
--   using (auth.uid() is not null) with check (auth.uid() is not null);
--
-- (análogo para service_orders, reception_guides, boxes, box_series,
--  sap_transfer_documents; warehouse_movements_auth FOR ALL USING true)
-- =============================================================================
