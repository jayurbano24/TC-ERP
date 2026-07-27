import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isSessionIdle } from '@/lib/session/idlePolicy';
import { getClientIpFromHeaders } from '@/lib/http/clientIp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** SEC-04: el body solo debe contener un `userId` no vacío. */
const CreateSchema = z.object({ userId: z.string().trim().min(1, 'Missing userId').max(200) });

const TouchSchema = z.object({
  sessionId: z.string().uuid('Invalid sessionId'),
});

function serviceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Registra sesión única por usuario (Single PC). */
export async function POST(request: Request) {
  try {
    const supabase = serviceClient();
    if (!supabase) {
      console.warn('Supabase env vars missing. Skipping session recording during build.');
      return NextResponse.json({ success: false, reason: 'build_mode' });
    }

    const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 }
      );
    }
    const { userId } = parsed.data;

    const ip = getClientIpFromHeaders(request.headers);
    const now = new Date().toISOString();

    await supabase.from('user_sessions').delete().eq('user_id', userId);

    const { data, error } = await supabase
      .from('user_sessions')
      .insert({
        user_id: userId,
        ip_address: ip,
        last_seen: now,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sessionId: data.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Heartbeat de presencia: actualiza last_seen si la sesión sigue activa.
 * Si ya superó el idle, elimina la fila y responde 401 para forzar logout en cliente.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = serviceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'build_mode' }, { status: 503 });
    }

    const parsed = TouchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 }
      );
    }
    const { sessionId } = parsed.data;

    const { data: row, error: readError } = await supabase
      .from('user_sessions')
      .select('id, user_id, last_seen')
      .eq('id', sessionId)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'SESSION_GONE', active: false }, { status: 401 });
    }

    if (isSessionIdle(row.last_seen)) {
      // Solo borra la fila de presencia. NO revocar Auth global: eso expulsaba
      // al mismo usuario en todos los PCs/navegadores a la vez.
      await supabase.from('user_sessions').delete().eq('id', sessionId);
      return NextResponse.json({ error: 'SESSION_IDLE', active: false }, { status: 401 });
    }

    const now = new Date().toISOString();
    const ip = getClientIpFromHeaders(request.headers);
    const { error: updError } = await supabase
      .from('user_sessions')
      .update({ last_seen: now, ip_address: ip })
      .eq('id', sessionId);

    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, active: true, lastSeen: now });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
