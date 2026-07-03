import { EMPLOYEE_DOMAIN_SELECT } from '@/shared/constants/dbProjections';
import { IRrhhRepository } from '../../domain/repositories/IRrhhRepository';
import { EmpleadoAggregate } from '../../domain/aggregates/EmpleadoAggregate';
import { AsistenciaAggregate } from '../../domain/aggregates/AsistenciaAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export class RrhhSupabaseRepository implements IRrhhRepository {
  async saveEmpleado(ctx: RequestContext, empleado: EmpleadoAggregate): Promise<void> {
    const supabase = getSupabaseServerClient();
    const state = empleado.toState();
    await supabase.from('employees').upsert({
      id: state.id,
      tenant_id: state.tenantId,
      branch_id: state.branchId,
      nombre: state.nombre,
      apellidos: state.apellido,
      cargo: state.cargo,
      departamento: state.departamento,
      estado: state.estado,
    });
  }

  async getEmpleadoById(ctx: RequestContext, id: string): Promise<EmpleadoAggregate | null> {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from('employees')
      .select(EMPLOYEE_DOMAIN_SELECT)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (!data) return null;

    return EmpleadoAggregate.rehydrate(
      data.id,
      data.tenant_id,
      data.branch_id,
      {
        nombre: data.nombre,
        apellido: data.apellidos ?? data.apellido ?? '',
        dni: data.dni ?? '',
        cargo: data.cargo,
        departamento: data.departamento,
        estado: data.estado,
        userId: data.user_id ?? undefined,
      }
    );
  }

  async saveAsistencia(ctx: RequestContext, asistencia: AsistenciaAggregate): Promise<void> {
    const supabase = getSupabaseServerClient();
    const state = asistencia.toState();
    await supabase.from('rrhh_asistencia').upsert({
      id: state.id,
      tenant_id: state.tenantId,
      branch_id: state.branchId,
      empleado_id: state.empleadoId,
      fecha: state.fecha.toISOString().split('T')[0],
      tipo: state.tipo,
      entrada: state.entrada?.toISOString(),
      salida: state.salida?.toISOString(),
      horas_trabajadas: state.horasTrabajadas,
    });
  }

  async incrementarReparacionesExitosas(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void> {
    // Stub
  }

  async incrementarReparacionesFallidas(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void> {
    // Stub
  }

  async incrementarDiagnosticos(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void> {
    // Stub
  }
}
