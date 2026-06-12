import { getSupabaseBrowserClient } from './supabase/client';

export async function signInWithEmail(identifier: string, password: string) {
  let normalizedIdentifier = identifier.trim().toLowerCase();

  // Si no contiene '@', asumimos que es un nombre de usuario corto y le añadimos el dominio principal
  if (!normalizedIdentifier.includes('@')) {
    normalizedIdentifier = `${normalizedIdentifier}@techcommwireless.com`;
  }

  // DEV BYPASS: Solo para cuentas ficticias que NO existen en Supabase Auth
  const isDevAdmin = 
    (normalizedIdentifier === 'admin@cenam.com' && password === 'admin123') ||
    (normalizedIdentifier === 'admin@techcorps.com' && password === 'admin123') ||
    (normalizedIdentifier === 'admin@techcommwireless.com' && password === 'admin123') ||
    (normalizedIdentifier === 'admin@tcerp.local' && password === 'admin123');

  if (isDevAdmin) {
    return { user: { id: 'dev-user', email: normalizedIdentifier }, session: null };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('Supabase client not configured');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedIdentifier,
    password,
  });

  if (error) {
    throw error;
  }
  return data;
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
