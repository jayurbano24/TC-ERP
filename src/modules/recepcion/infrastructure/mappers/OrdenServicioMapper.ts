import { OrdenServicioAggregate } from '../../domain/aggregates/OrdenServicioAggregate';
import { injectable } from 'tsyringe';

@injectable()
export class OrdenServicioMapper {
  toDomain(raw: any): OrdenServicioAggregate {
    // Reconstruir el agregado usando métodos de reconstrucción si existen
    // Para simplificar:
    return OrdenServicioAggregate.create(
      raw.id,
      raw.tenant_id,
      raw.branch_id,
      raw.tipo_recepcion as 'CAC' | 'PX',
      {
        estadoRecepcion: raw.estado_recepcion,
        diagnosticoInicial: raw.diagnostico_inicial,
        fallaReportada: raw.falla_reportada,
        guiaPx: raw.guia_px,
        transporte: raw.transporte,
        equipo: {
          id: raw.equipo_id,
          numeroSerie: raw.equipo?.numero_serie || '', // Requiere join en find
          marca: raw.equipo?.marca,
          modelo: raw.equipo?.modelo,
          tipoDispositivo: raw.equipo?.tipo_dispositivo
        }
      }
    );
  }

  toPersistence(domain: OrdenServicioAggregate): any {
    return {
      id: domain.id,
      tenant_id: domain.tenantId,
      branch_id: domain.branchId,
      equipo_id: domain.props.equipo.id,
      tipo_recepcion: domain.props.tipoRecepcion,
      estado_recepcion: domain.props.estadoRecepcion,
      diagnostico_inicial: domain.props.diagnosticoInicial,
      falla_reportada: domain.props.fallaReportada,
      guia_px: domain.props.guiaPx,
      transporte: domain.props.transporte,
      version: domain.version,
      is_deleted: domain.isDeleted
    };
  }
}
