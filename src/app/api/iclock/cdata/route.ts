import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ZKTecoSyncService } from '@/modules/rrhh/application/services/ZKTecoSyncService';
import { MAX_DEVICE_LINES, attLogRecordSchema, parseDeviceSn } from '../_shared';

export const dynamic = 'force-dynamic';

/**
 * Endpoint principal de ADMS ZKTeco.
 * El dispositivo consulta aquí opciones (GET) y envía marcaciones de asistencia (POST).
 */

const textOk = (body = 'OK') =>
  new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });

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
  } catch (err) {
    console.error('[iclock/cdata] GET upsert device error:', err);
  }

  // Configuraciones básicas de Push SDK requeridas por el reloj
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

  return textOk(options);
}

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sn = parseDeviceSn(searchParams);
  const table = searchParams.get('table'); // usualmente 'ATTLOG' para asistencias

  if (!sn) {
    return textOk();
  }

  try {
    const supabase = getSupabaseServerClient();

    await supabase.from('zk_devices').upsert(
      { sn, state: 'ONLINE', last_activity: new Date().toISOString() },
      { onConflict: 'sn' }
    );

    if (table === 'ATTLOG') {
      const bodyText = await request.text();
      const lines = bodyText
        .split('\n')
        .filter((l) => l.trim() !== '')
        .slice(0, MAX_DEVICE_LINES);

      const syncService = new ZKTecoSyncService();

      for (const line of lines) {
        const parts = line.split('\t');
        const parsed = attLogRecordSchema.safeParse({
          userPin: parts[0],
          checkTime: parts[1],
          verifyType: parts[2],
          sensorStatus: parts[3],
        });

        if (!parsed.success) {
          continue; // línea malformada: se ignora sin romper el lote
        }

        const { userPin, checkTime, verifyType, sensorStatus } = parsed.data;

        const { data: rawLog, error } = await supabase
          .from('zk_raw_logs')
          .insert({
            device_sn: sn,
            user_pin: userPin,
            check_time: checkTime.toISOString(),
            verify_type: verifyType,
            sensor_status: sensorStatus,
            processed: false,
          })
          .select()
          .single();

        if (!error && rawLog) {
          syncService.processRawLog(rawLog.id).catch(console.error);
        }
      }
    }
  } catch (err) {
    // Se ACK al reloj igualmente para evitar tormentas de reintentos; el detalle se loguea.
    console.error('[iclock/cdata] POST error:', err);
  }

  return textOk('OK\n');
}
