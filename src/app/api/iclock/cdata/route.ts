import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ZKTecoSyncService } from '@/modules/rrhh/application/services/ZKTecoSyncService';

/**
 * Endpoint principal de ADMS ZKTeco.
 * El dispositivo consulta aquí opciones (GET) y envía marcaciones de asistencia (POST).
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sn = searchParams.get('SN');
  
  if (!sn) {
    return new NextResponse('OK', { status: 200 });
  }

  // Actualizamos last_activity del dispositivo
  const supabase = getSupabaseServerClient();
  await supabase.from('zk_devices').upsert({ 
    sn: sn,
    state: 'ONLINE',
    last_activity: new Date().toISOString()
  }, { onConflict: 'sn' });

  // Retornar configuraciones básicas de Push SDK requeridas por el reloj
  const options = `GET OPTION FROM: ${sn}
Stamp=9999
OpStamp=9999
ErrorDelay=60
Delay=30
TransTimes=00:00;14:00
TransInterval=1
TransFlag=1111000000
Realtime=1
Encrypt=0`;

  return new NextResponse(options, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sn = searchParams.get('SN');
  const table = searchParams.get('table'); // usualmente 'ATTLOG' para asistencias

  if (!sn) {
    return new NextResponse('OK', { status: 200 });
  }

  const supabase = getSupabaseServerClient();
  
  // Mantenemos el estado activo
  await supabase.from('zk_devices').upsert({ 
    sn: sn,
    state: 'ONLINE',
    last_activity: new Date().toISOString()
  }, { onConflict: 'sn' });

  const bodyText = await request.text();

  if (table === 'ATTLOG') {
    // Formato ZKTeco:
    // USER_PIN\tCHECK_TIME\tVERIFY_TYPE\tSENSOR_STATUS\tWORK_CODE\tRESERVED
    // Ej: 1\t2026-06-16 08:00:00\t15\t0\t0\t0
    
    const lines = bodyText.split('\n').filter(l => l.trim() !== '');
    const syncService = new ZKTecoSyncService();

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const userPin = parts[0].trim();
        const checkTimeStr = parts[1].trim(); // Formato YYYY-MM-DD HH:mm:ss
        
        // Crear fecha válida. ZKTeco manda tiempo local del reloj.
        const checkTime = new Date(checkTimeStr.replace(' ', 'T') + 'Z'); 
        // Nota: en un entorno real, ajustaríamos el timezone si es necesario.

        const verifyType = parts[2] ? parseInt(parts[2]) : 0;
        const sensorStatus = parts[3] ? parseInt(parts[3]) : 0;
        
        const { data: rawLog, error } = await supabase.from('zk_raw_logs').insert({
          device_sn: sn,
          user_pin: userPin,
          check_time: checkTime.toISOString(),
          verify_type: verifyType,
          sensor_status: sensorStatus,
          processed: false
        }).select().single();

        if (!error && rawLog) {
          // Procesar el log asíncronamente
          syncService.processRawLog(rawLog.id).catch(console.error);
        }
      }
    }

    // Responder OK al reloj indicando cantidad de logs recibidos
    return new NextResponse(`OK\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Si envían otra tabla (OPERLOG, BIODATA), simplemente decimos OK
  return new NextResponse('OK', { status: 200 });
}
