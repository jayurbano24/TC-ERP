-- RLS para sap_transfer_documents (faltaba en 024 → INSERT bloqueado en Backoffice CAC)

ALTER TABLE public.sap_transfer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sap_transfer_documents_read_auth ON public.sap_transfer_documents;
CREATE POLICY sap_transfer_documents_read_auth ON public.sap_transfer_documents
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS sap_transfer_documents_write_ops ON public.sap_transfer_documents;
CREATE POLICY sap_transfer_documents_write_ops ON public.sap_transfer_documents
  FOR ALL USING (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  )
  WITH CHECK (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  );

-- Respaldo: cualquier usuario autenticado (Backoffice / Administrador ERP)
DROP POLICY IF EXISTS sap_transfer_documents_auth_fallback ON public.sap_transfer_documents;
CREATE POLICY sap_transfer_documents_auth_fallback ON public.sap_transfer_documents
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Backoffice CAC crea service_orders al clasificar equipos
DROP POLICY IF EXISTS service_orders_write_ops ON public.service_orders;
CREATE POLICY service_orders_write_ops ON public.service_orders
  FOR ALL USING (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('tecnico') OR public.app_has_role('qc') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  )
  WITH CHECK (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('tecnico') OR public.app_has_role('qc') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  );

-- reception_guides: upsert desde backoffice al finalizar guía
ALTER TABLE public.reception_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reception_guides_read_auth ON public.reception_guides;
CREATE POLICY reception_guides_read_auth ON public.reception_guides
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS reception_guides_write_ops ON public.reception_guides;
CREATE POLICY reception_guides_write_ops ON public.reception_guides
  FOR ALL USING (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  )
  WITH CHECK (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  );

DROP POLICY IF EXISTS reception_guides_auth_fallback ON public.reception_guides;
CREATE POLICY reception_guides_auth_fallback ON public.reception_guides
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS service_orders_auth_fallback ON public.service_orders;
CREATE POLICY service_orders_auth_fallback ON public.service_orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
