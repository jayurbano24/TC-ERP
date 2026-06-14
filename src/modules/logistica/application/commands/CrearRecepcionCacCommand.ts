import { RequestContext } from '../../../../shared/context/RequestContext';
import { ZodValidator } from '../../../../shared/validation/ZodValidator';
import { CrearRecepcionCacDTO, CrearRecepcionCacSchema } from '../dto/RecepcionDTO';
import { IOrdenServicioRepository } from '../../domain/repositories/IOrdenServicioRepository';
import { OrdenServicioAggregate } from '../../domain/aggregates/OrdenServicioAggregate';
import { v4 as uuidv4 } from 'uuid';

export class CrearRecepcionCacCommand {
  constructor(private readonly repository: IOrdenServicioRepository) {}

  async execute(ctx: RequestContext, dto: CrearRecepcionCacDTO): Promise<void> {
    const data = ZodValidator.validate(CrearRecepcionCacSchema, dto);
    
    // Crear el agregado
    const orden = OrdenServicioAggregate.create(
      uuidv4(),
      ctx.tenantId,
      ctx.branchId,
      {
        tipoRecepcion: 'CAC',
        estadoRecepcion: 'INGRESADO',
        fallaReportada: data.fallaReportada,
        diagnosticoInicial: data.diagnosticoInicial,
        equipo: {
          id: uuidv4(),
          numeroSerie: data.numeroSerie,
          marca: data.marca,
          modelo: data.modelo,
          tipoDispositivo: data.tipoDispositivo
        }
      }
    );

    // Guardar usando el repositorio (esto disparará eventos vía Outbox)
    await this.repository.save(orden);
  }
}
