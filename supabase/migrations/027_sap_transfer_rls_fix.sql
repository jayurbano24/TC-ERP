-- Fix RLS sap_transfer_documents: políticas INSERT/SELECT explícitas + RPC SECURITY DEFINER

ALTER TABLE public.sap_transfer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sap_transfer_documents_read_auth ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_write_ops ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_auth_fallback ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_select_auth ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_insert_auth ON public.sap_transfer_documents;
DROP POLICY IF EXISTS sap_transfer_documents_update_auth ON public.sap_transfer_documents;

CREATE POLICY sap_transfer_documents_select_auth ON public.sap_transfer_documents
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY sap_transfer_documents_insert_auth ON public.sap_transfer_documents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY sap_transfer_documents_update_auth ON public.sap_transfer_documents
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY sap_transfer_documents_write_ops ON public.sap_transfer_documents
  FOR ALL USING (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('gerencia') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  )
  WITH CHECK (
    public.app_has_role('admin') OR public.app_has_role('supervisor') OR
    public.app_has_role('gerencia') OR
    public.app_has_role('receptor_cac') OR public.app_has_role('receptor_px') OR
    public.app_has_role('bodega')
  );

-- RPC: crea/obtiene documento SAP evitando bloqueos RLS en Backoffice CAC
CREATE OR REPLACE FUNCTION public.create_or_get_sap_transfer_document(
  p_reception_id uuid,
  p_reception_guide_id uuid,
  p_sap_document_number text,
  p_agency text DEFAULT NULL,
  p_registered_by text DEFAULT NULL
)
RETURNS public.sap_transfer_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc text := trim(p_sap_document_number);
  rec public.sap_transfer_documents;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_doc = '' THEN
    RAISE EXCEPTION 'SAP document number required';
  END IF;

  SELECT * INTO rec
  FROM public.sap_transfer_documents
  WHERE reception_guide_id = p_reception_guide_id
    AND sap_document_number = v_doc;

  IF FOUND THEN
    IF p_agency IS NOT NULL AND trim(p_agency) <> '' AND (rec.agency IS NULL OR trim(rec.agency) = '') THEN
      UPDATE public.sap_transfer_documents
      SET agency = trim(p_agency), updated_at = now()
      WHERE id = rec.id
      RETURNING * INTO rec;
    END IF;
    RETURN rec;
  END IF;

  INSERT INTO public.sap_transfer_documents (
    reception_id,
    reception_guide_id,
    sap_document_number,
    agency,
    registered_by,
    status
  ) VALUES (
    p_reception_id,
    p_reception_guide_id,
    v_doc,
    nullif(trim(p_agency), ''),
    p_registered_by,
    'PENDIENTE_INGRESO_BODEGA'
  )
  RETURNING * INTO rec;

  RETURN rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_get_sap_transfer_document TO authenticated;

NOTIFY pgrst, 'reload schema';
