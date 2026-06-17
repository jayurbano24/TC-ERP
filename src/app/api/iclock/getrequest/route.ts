import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Endpoint de ADMS para recibir peticiones (Polling) del reloj ZKTeco.
 * El dispositivo consulta aquí periódicamente para saber si el servidor le tiene alguna orden.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sn = searchParams.get('SN');
  
  if (!sn) {
    return new NextResponse('OK', { status: 200 });
  }

  const supabase = await getSupabaseServerClient();

  // 1. Mantener estado online
  await supabase.from('zk_devices').upsert({ 
    sn: sn,
    state: 'ONLINE',
    last_activity: new Date().toISOString()
  }, { onConflict: 'sn' });

  // 2. Buscar comandos pendientes para este SN
  const { data: commands, error } = await supabase
    .from('zk_commands')
    .select('*')
    .eq('device_sn', sn)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(10); // Enviamos max 10 comandos por polling

  if (error || !commands || commands.length === 0) {
    return new NextResponse('OK', { status: 200 });
  }

  // 3. Formatear la respuesta
  // ZKTeco requiere este formato: C:<id>:<comando>
  // Ej: C:123:DATA UPDATE USERINFO PIN=100 Name=Juan
  
  let responseBody = '';
  const commandIds = [];

  for (const cmd of commands) {
    responseBody += `C:${cmd.id}:${cmd.command_str}\n`;
    commandIds.push(cmd.id);
  }

  // 4. Actualizar estado a SENT
  await supabase
    .from('zk_commands')
    .update({ status: 'SENT', sent_at: new Date().toISOString() })
    .in('id', commandIds);

  return new NextResponse(responseBody, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
