import { getSupabaseBrowserClient } from '../supabase/client';

export async function uploadAvatar(userId: string, file: File): Promise<{ url?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase client not configured" };

  try {
    const fileExt = file.name.split('.').pop();
    // Unique name to avoid caching issues on replace
    const fileName = `${userId}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${fileName}`;

    // Upload image to 'avatars' bucket
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return { error: uploadError.message };
    }

    // Get public URL
    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    
    if (!data || !data.publicUrl) {
      return { error: "No se pudo obtener la URL de la imagen" };
    }

    return { url: data.publicUrl };
  } catch (err: any) {
    console.error("Storage error:", err);
    return { error: err.message || "Error al subir la imagen" };
  }
}
