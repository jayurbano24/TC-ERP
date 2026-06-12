import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usamos el cliente admin para saltar RLS al borrar/crear sesiones si es necesario, 
// o simplemente el anon key si RLS lo permite. RLS lo permite porque usamos auth.uid()
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Obtener IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

    // Borrar sesiones anteriores (Single PC)
    await supabase.from('user_sessions').delete().eq('user_id', userId);

    // Crear nueva sesión
    const { data, error } = await supabase.from('user_sessions').insert({
      user_id: userId,
      ip_address: ip
    }).select('id').single();

    if (error) {
      console.error('Error creating session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Retornar el session_id para guardarlo en una cookie si es necesario
    return NextResponse.json({ success: true, sessionId: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
