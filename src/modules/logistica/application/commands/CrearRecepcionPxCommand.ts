import { RequestContext } from '../../../../shared/context/RequestContext';
import { ZodValidator } from '../../../../shared/validation/ZodValidator';
import { CrearRecepcionPxDTO, CrearRecepcionPxSchema } from '../dto/RecepcionDTO';
import { IOrdenServicioRepository } from '../../domain/repositories/IOrdenServicioRepository';
import { OrdenServicioAggregate } from '../../domain/aggregates/OrdenServicioAggregate';
import { v4 as uuidv4 } from 'uuid';

export class CrearRecepcionPxCommand {
  constructor(private readonly repository: IOrdenServicioRepository) {}

  async execute(ctx: RequestContext, dto: CrearRecepcionPxDTO): Promise<void> {
    const data = ZodValidator.validate(CrearRecepcionPxSchema, dto);
    
    // Crear el agregado
    const orden = OrdenServicioAggregate.create(
      uuidv4(),
      ctx.tenantId,
      ctx.branchId,
      {
        tipoRecepcion: 'PX',
        estadoRecepcion: 'INGRESADO',
        fallaReportada: data.fallaReportada,
        diagnosticoInicial: data.diagnosticoInicial,
        guiaPx: data.guiaPx,
        transporte: data.transporte,
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
