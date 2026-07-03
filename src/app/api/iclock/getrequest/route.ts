import { ZK_COMMAND_SELECT } from '@/shared/constants/dbProjections';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { parseDeviceSn } from '../_shared';

export const dynamic = 'force-dynamic';

const textOk = (body = 'OK') =>
  new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });

/**
 * Endpoint de ADMS para recibir peticiones (Polling) del reloj ZKTeco.
 * El dispositivo consulta aquí periódicamente para saber si el servidor le tiene alguna orden.
 */
export async function GET(request: NextRequest) {
  const sn = parseDeviceSn(request.nextUrl.searchParams);
  if (!sn) {
    return textOk();
  }

  try {
    const supabase = getSupabaseServerClient();

    await supabase.from('zk_devices').upsert(
      { sn, state: 'ONLINE', last_activity: new Date().toISOString() },
      { onConflict: 'sn' }
    );

    const { data: commands, error } = await supabase
      .from('zk_commands')
      .select(ZK_COMMAND_SELECT)
      .eq('device_sn', sn)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(10); // Enviamos max 10 comandos por polling

    if (error || !commands || commands.length === 0) {
      return textOk();
    }

    // ZKTeco requiere este formato: C:<id>:<comando>
    let responseBody = '';
    const commandIds: string[] = [];

    for (const cmd of commands) {
      responseBody += `C:${cmd.id}:${cmd.command_str}\n`;
      commandIds.push(cmd.id);
    }

    await supabase
      .from('zk_commands')
      .update({ status: 'SENT', sent_at: new Date().toISOString() })
      .in('id', commandIds);

    return textOk(responseBody);
  } catch (err) {
    console.error('[iclock/getrequest] GET error:', err);
    return textOk();
  }
}
