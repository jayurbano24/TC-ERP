-- Crear el bucket de Storage para Avatares si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Crear política RLS para permitir a cualquier usuario VER los avatares
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'avatars' );

-- Crear política RLS para permitir a usuarios autenticados SUBIR avatares
CREATE POLICY "Authenticated users can upload avatars" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

-- Crear política RLS para permitir a usuarios autenticados ELIMINAR/ACTUALIZAR sus propios avatares o de otros (en modo admin)
CREATE POLICY "Authenticated users can update/delete avatars" 
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete avatars" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

-- Añadir columna avatar_url a profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
