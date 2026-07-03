import {
  RRHH_ASISTENCIA_SELECT,
  ZK_RAW_LOG_SELECT,
} from '@/shared/constants/dbProjections';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { RegistrarAsistenciaCommand } from '../commands/RegistrarAsistenciaCommand';
import { RrhhSupabaseRepository } from '../../infrastructure/repositories/RrhhSupabaseRepository';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class ZKTecoSyncService {
  /**
   * Procesa un raw log de ZKTeco y lo convierte en una AsistenciaAggregate si aplica.
   * En ZKTeco los marcajes vienen como "punches" sueltos.
   * Necesitamos determinar si es entrada o salida basado en el último registro del día.
   */
  async processRawLog(rawLogId: string) {
    const supabase = await getSupabaseServerClient();
    
    // 1. Obtener el raw log
    const { data: rawLog, error: rawError } = await supabase
      .from('zk_raw_logs')
      .select(ZK_RAW_LOG_SELECT)
      .eq('id', rawLogId)
      .single();

    if (rawError || !rawLog) {
      console.error('Error fetching raw log:', rawError);
      return;
    }

    if (rawLog.processed) return; // Ya fue procesado

    // 2. Buscar al empleado por su pin_reloj
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, branch_id, tenant_id')
      .eq('pin_reloj', rawLog.user_pin)
      .single();

    if (empError || !employee) {
      console.warn(`No employee found for pin_reloj: ${rawLog.user_pin}`);
      return;
    }

    const fechaMarcaje = new Date(rawLog.check_time);
    const fechaSolo = fechaMarcaje.toISOString().split('T')[0]; // YYYY-MM-DD

    // 3. Buscar si ya existe una asistencia para este empleado en este día
    const { data: asistenciaHoy } = await supabase
      .from('rrhh_asistencia')
      .select(RRHH_ASISTENCIA_SELECT)
      .eq('empleado_id', employee.id)
      .eq('fecha', fechaSolo)
      .single();

    const repo = new RrhhSupabaseRepository();
    const command = new RegistrarAsistenciaCommand(repo);
    const ctx = new RequestContext({ tenantId: employee.tenant_id, branchId: employee.branch_id, userId: 'system' });

    try {
      if (!asistenciaHoy) {
        // Es el primer marcaje del día -> Entrada
        await command.execute(ctx, {
          empleadoId: employee.id,
          fecha: new Date(fechaSolo),
          entrada: fechaMarcaje,
          tipo: 'PRESENCIAL' // Por defecto si marca en reloj
        });
      } else {
        // Ya existe entrada, actualizamos la salida directamente
        // En un caso real, el command debería tener un 'MarcarSalidaCommand'
        // Pero por simplicidad, actualizamos vía supabase
        await supabase
          .from('rrhh_asistencia')
          .update({ salida: fechaMarcaje.toISOString() })
          .eq('id', asistenciaHoy.id);
      }

      // Marcar el raw log como procesado
      await supabase
        .from('zk_raw_logs')
        .update({ processed: true })
        .eq('id', rawLog.id);

    } catch (e) {
      console.error('Error procesando log de ZKTeco:', e);
    }
  }

  /**
   * Encola un comando para el dispositivo ZKTeco (Ej: agregar usuario)
   */
  async queueCommand(deviceSn: string, commandStr: string) {
    const supabase = await getSupabaseServerClient();
    await supabase.from('zk_commands').insert({
      device_sn: deviceSn,
      command_str: commandStr,
      status: 'PENDING'
    });
  }
}
