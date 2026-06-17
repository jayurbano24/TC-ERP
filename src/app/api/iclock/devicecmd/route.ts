import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Endpoint ADMS ZKTeco para recibir confirmaciones de ejecución de comandos.
 * El dispositivo hace un POST aquí cuando finaliza un comando (exitoso o fallido).
 */
export async function POST(request: NextRequest) {
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

  const bodyText = await request.text();
  
  // ZKTeco envía el resultado en este formato:
  // ID=123&Return=0&CMD=DATA UPDATE USERINFO...
  // Return=0 significa éxito. Valores < 0 significan error.

  const lines = bodyText.split('\n').filter(l => l.trim() !== '');

  for (const line of lines) {
    const params = new URLSearchParams(line);
    const commandId = params.get('ID');
    const returnCode = params.get('Return');

    if (commandId) {
      const isSuccess = returnCode === '0';
      
      await supabase
        .from('zk_commands')
        .update({
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          return_code: returnCode,
          executed_at: new Date().toISOString()
        })
        .eq('id', commandId);
    }
  }

  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
