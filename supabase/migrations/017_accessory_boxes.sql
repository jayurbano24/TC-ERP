-- Migration: 017_accessory_boxes
CREATE TABLE IF NOT EXISTS public.accessory_boxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_order TEXT NOT NULL UNIQUE,
    accessory_id UUID NOT NULL REFERENCES public.accessories(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    status TEXT NOT NULL CHECK (status IN (
        'Clasificado, Pendiente de Limpiar',
        'Clasificado, Pendiente de Probar',
        'Clasificado Y Limpio'
    )),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.accessory_boxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read accessory_boxes"
    ON public.accessory_boxes FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert accessory_boxes"
    ON public.accessory_boxes FOR INSERT
    TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update accessory_boxes"
    ON public.accessory_boxes FOR UPDATE
    TO authenticated USING (true);
