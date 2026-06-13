-- Migration: 016_bodega_accesorios
-- Create accessories table
CREATE TABLE IF NOT EXISTS public.accessories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sku TEXT,
    qty_new INTEGER NOT NULL DEFAULT 0,
    qty_recovered INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read accessories"
    ON public.accessories FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert accessories"
    ON public.accessories FOR INSERT
    TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update accessories"
    ON public.accessories FOR UPDATE
    TO authenticated USING (true);

-- Create accessory movements table
CREATE TABLE IF NOT EXISTS public.accessory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accessory_id UUID NOT NULL REFERENCES public.accessories(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
    condition TEXT NOT NULL CHECK (condition IN ('NEW', 'RECOVERED')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    sap_transfer_number TEXT,
    destination TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.accessory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read accessory movements"
    ON public.accessory_movements FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert accessory movements"
    ON public.accessory_movements FOR INSERT
    TO authenticated WITH CHECK (true);

-- Trigger for updating accessory quantities
CREATE OR REPLACE FUNCTION update_accessory_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.movement_type = 'IN' THEN
        IF NEW.condition = 'NEW' THEN
            UPDATE public.accessories SET qty_new = qty_new + NEW.quantity, updated_at = NOW() WHERE id = NEW.accessory_id;
        ELSIF NEW.condition = 'RECOVERED' THEN
            UPDATE public.accessories SET qty_recovered = qty_recovered + NEW.quantity, updated_at = NOW() WHERE id = NEW.accessory_id;
        END IF;
    ELSIF NEW.movement_type = 'OUT' THEN
        IF NEW.condition = 'NEW' THEN
            -- Opcional: verificar si hay stock suficiente
            UPDATE public.accessories SET qty_new = qty_new - NEW.quantity, updated_at = NOW() WHERE id = NEW.accessory_id;
        ELSIF NEW.condition = 'RECOVERED' THEN
            UPDATE public.accessories SET qty_recovered = qty_recovered - NEW.quantity, updated_at = NOW() WHERE id = NEW.accessory_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_accessory_qty
AFTER INSERT ON public.accessory_movements
FOR EACH ROW
EXECUTE FUNCTION update_accessory_quantity();
