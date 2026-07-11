import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { MAX_DEVICE_LINES, commandResultSchema, parseDeviceSn } from '../_shared';
import { assertIclockDeviceSecret } from '../deviceAuth';

export const dynamic = 'force-dynamic';

/**
 * Endpoint ADMS ZKTeco para recibir confirmaciones de ejecución de comandos.
 */
export async function POST(request: NextRequest) {
  const secret = assertIclockDeviceSecret(request);
  if (!secret.ok) {
    return new NextResponse(secret.body, {
      status: secret.status,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const sn = parseDeviceSn(request.nextUrl.searchParams);
  if (!sn) {
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  try {
    const supabase = getSupabaseServerClient();

    await supabase.from('zk_devices').upsert(
      { sn, state: 'ONLINE', last_activity: new Date().toISOString() },
      { onConflict: 'sn' }
    );

    const bodyText = await request.text();
    // Formato: ID=123&Return=0&CMD=DATA UPDATE USERINFO...
    const lines = bodyText
      .split('\n')
      .filter((l) => l.trim() !== '')
      .slice(0, MAX_DEVICE_LINES);

    for (const line of lines) {
      const params = new URLSearchParams(line);
      const parsed = commandResultSchema.safeParse({
        ID: params.get('ID'),
        Return: params.get('Return') ?? '',
      });

      if (!parsed.success) {
        continue;
      }

      const { ID, Return } = parsed.data;
      const isSuccess = Return === '0';

      await supabase
        .from('zk_commands')
        .update({
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          return_code: Return,
          executed_at: new Date().toISOString(),
        })
        .eq('id', ID);
    }
  } catch (err) {
    console.error('[iclock/devicecmd] POST error:', err);
  }

  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
