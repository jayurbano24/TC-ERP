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
    if (typeof window !== 'undefined') {
      localStorage.setItem('tcerp_dev_session', JSON.stringify({ email: normalizedIdentifier, role: 'ADMINISTRADOR' }));
    }
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

export async function getActualUserFullName() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return 'SISTEMA';
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return 'SISTEMA';

    // 1. Try employees table by email
    if (session.user.email) {
      const { data: emp } = await supabase.from('employees').select('nombre_completo').eq('email', session.user.email).single();
      if (emp && emp.nombre_completo) return emp.nombre_completo;
    }
    
    // 2. Fallback to profiles table
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single();
    if (profile && profile.full_name && profile.full_name !== 'Admin User') {
      return profile.full_name;
    }

    // 3. Fallback to email prefix
    return session.user.email ? session.user.email.split('@')[0] : 'SISTEMA';
  } catch (err) {
    console.error("Error fetching actual user name:", err);
    return 'SISTEMA';
  }
}
