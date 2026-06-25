import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** SEC-04: el body solo debe contener un `userId` no vacío. */
const SessionSchema = z.object({ userId: z.string().trim().min(1, 'Missing userId').max(200) });

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('Supabase env vars missing. Skipping session recording during build.');
      return NextResponse.json({ success: false, reason: 'build_mode' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const parsed = SessionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 }
      );
    }
    const { userId } = parsed.data;

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
