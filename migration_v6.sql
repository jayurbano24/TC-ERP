-- Tabla nueva: una fila por guía
CREATE TABLE reception_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id UUID REFERENCES receptions(id) ON DELETE CASCADE,
  guide_number TEXT NOT NULL,
  category TEXT CHECK (category IN ('equipo','accesorio','telefono','devolucion')),
  status TEXT DEFAULT 'PENDIENTE',
  agency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para queries rápidas
CREATE INDEX idx_reception_guides_reception_id 
  ON reception_guides(reception_id);

CREATE INDEX idx_reception_guides_status 
  ON reception_guides(status);

-- Columna en service_orders para trazabilidad
ALTER TABLE service_orders 
  ADD COLUMN reception_guide_id UUID REFERENCES reception_guides(id);
