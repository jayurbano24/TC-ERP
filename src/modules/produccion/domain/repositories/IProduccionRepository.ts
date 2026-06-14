import { DiagnosticoAggregate } from '../../../domain/aggregates/DiagnosticoAggregate';
import { ReparacionAggregate } from '../../../domain/aggregates/ReparacionAggregate';
import { RequestContext } from '../../../../../shared/context/RequestContext';

export interface IProduccionRepository {
  saveDiagnostico(ctx: RequestContext, diagnostico: DiagnosticoAggregate): Promise<void>;
  getDiagnosticoById(ctx: RequestContext, id: string): Promise<DiagnosticoAggregate | null>;
  
  saveReparacion(ctx: RequestContext, reparacion: ReparacionAggregate): Promise<void>;
  getReparacionById(ctx: RequestContext, id: string): Promise<ReparacionAggregate | null>;
}
