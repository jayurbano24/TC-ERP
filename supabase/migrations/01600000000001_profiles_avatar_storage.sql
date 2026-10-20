-- Promovido desde create_avatars_storage.sql (nombre inválido para Supabase CLI).
-- Consumido por src/lib/database/storage.ts y módulo Sistema/Seguridad.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update/delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
DROP POLICY IF EXISTS avatars_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS avatars_authenticated_delete ON storage.objects;

CREATE POLICY avatars_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_authenticated_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY avatars_authenticated_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_authenticated_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars');
