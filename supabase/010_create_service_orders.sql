-- Create service_orders table to track units and their re-entries
CREATE TABLE IF NOT EXISTS public.service_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_number SERIAL,
    os_label TEXT GENERATED ALWAYS AS ('TC-' || LPAD(os_number::text, 5, '0')) STORED,
    reception_id UUID REFERENCES public.receptions(id) ON DELETE CASCADE,
    model_id UUID REFERENCES public.models(id),
    brand_id UUID REFERENCES public.brands(id),
    main_serial TEXT NOT NULL, -- S1 or the primary identifier
    reentry_count INTEGER DEFAULT 1,
    status TEXT DEFAULT 'INGRESADO',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by serial to calculate re-entries
CREATE INDEX IF NOT EXISTS idx_service_orders_main_serial ON public.service_orders(main_serial);

-- Add OS reference to series table if needed, or link series to service_orders
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL;
