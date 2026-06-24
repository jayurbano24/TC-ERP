  -- Fase 2B — reporting: catálogo y auditoría de exportaciones (CHG-050)

  CREATE TABLE IF NOT EXISTS public.report_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    columns jsonb NOT NULL DEFAULT '[]'::jsonb,
    allowed_roles text[] NOT NULL DEFAULT ARRAY['admin', 'supervisor', 'gerencia'],
    requires_date_range boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.report_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_code text NOT NULL REFERENCES public.report_definitions(code),
    user_id uuid,
    user_name text,
    filters jsonb NOT NULL DEFAULT '{}'::jsonb,
    format text NOT NULL DEFAULT 'XLSX' CHECK (format IN ('XLSX', 'CSV')),
    status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    row_count int,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_report_runs_code_created
    ON public.report_runs (report_code, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_report_runs_user
    ON public.report_runs (user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

  ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS report_definitions_read ON public.report_definitions;
  CREATE POLICY report_definitions_read ON public.report_definitions
    FOR SELECT TO authenticated USING (is_active = true);

  DROP POLICY IF EXISTS report_runs_auth ON public.report_runs;
  CREATE POLICY report_runs_auth ON public.report_runs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS report_definitions_service ON public.report_definitions;
  CREATE POLICY report_definitions_service ON public.report_definitions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS report_runs_service ON public.report_runs;
  CREATE POLICY report_runs_service ON public.report_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  INSERT INTO public.report_definitions (code, name, category, description, requires_date_range, columns)
  VALUES
    (
      'CAC_CLASIFICACION_HISTORICO',
      'Histórico clasificación CAC',
      'CAC / Recepción',
      'Equipos clasificados en backoffice con OS TC-XXX',
      true,
      '["Fecha / Hora","No. Guía","Piloto","Courier","Recibió","Estatus","Orden de Servicio","Ingreso","Agencia CAC","Tecnología","Marca","Modelo","Documento SAP","Validación SAP","S-1","S-2","S-3","S-4"]'::jsonb
    ),
    (
      'RECEPCION_HISTORICO_CAC',
      'Histórico recepciones CAC',
      'CAC / Recepción',
      'Guías recepcionadas en CAC',
      true,
      '["Fecha","No. Guía","Piloto","Courier","Recibió","Estatus","Unidades"]'::jsonb
    ),
    (
      'INVENTARIO_ACCESORIOS',
      'Stock accesorios',
      'Bodega',
      'Stock nuevo y recuperado por accesorio',
      false,
      '["Código","Nombre","Qty Nuevo","Qty Recuperado","Último movimiento"]'::jsonb
    ),
    (
      'DESPACHO_POR_LOTE_SALIDA',
      'Contenido lote de salida',
      'Despacho',
      'Equipos y accesorios agrupados por lote LS-YYYY-NNNNN',
      true,
      '["Lote","Estado Lote","Tipo","Referencia","Detalle","Cantidad","Destino","Fecha"]'::jsonb
    ),
    (
      'DESPACHO_ACCESORIOS_SIN_LOTE',
      'Salidas accesorios directas',
      'Despacho',
      'Movimientos OUT sin lote de salida',
      true,
      '["Fecha","Accesorio","Condición","Cantidad","Destino","Usuario"]'::jsonb
    )
  ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    requires_date_range = EXCLUDED.requires_date_range,
    columns = EXCLUDED.columns,
    is_active = true;
