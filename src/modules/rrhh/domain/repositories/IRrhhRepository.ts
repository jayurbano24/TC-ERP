import { RequestContext } from '../../../../shared/context/RequestContext';
import { EmpleadoAggregate } from '../aggregates/EmpleadoAggregate';
import { AsistenciaAggregate } from '../aggregates/AsistenciaAggregate';

export interface IRrhhRepository {
  // Empleados
  saveEmpleado(ctx: RequestContext, empleado: EmpleadoAggregate): Promise<void>;
  getEmpleadoById(ctx: RequestContext, id: string): Promise<EmpleadoAggregate | null>;
  
  // Asistencias
  saveAsistencia(ctx: RequestContext, asistencia: AsistenciaAggregate): Promise<void>;
  
  // Desempeño
  incrementarReparacionesExitosas(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void>;
  incrementarReparacionesFallidas(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void>;
  incrementarDiagnosticos(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void>;
}
