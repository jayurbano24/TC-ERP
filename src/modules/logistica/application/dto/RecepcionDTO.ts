import { z } from 'zod';

export const RecepcionEquipoSchema = z.object({
  numeroSerie: z.string().min(3),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  tipoDispositivo: z.string().optional(),
  diagnosticoInicial: z.string().optional(),
  fallaReportada: z.string().optional(),
});

export const CrearRecepcionCacSchema = RecepcionEquipoSchema.extend({});

export const CrearRecepcionPxSchema = RecepcionEquipoSchema.extend({
  guiaPx: z.string().min(1),
  transporte: z.string().min(1),
});

export type CrearRecepcionCacDTO = z.infer<typeof CrearRecepcionCacSchema>;
export type CrearRecepcionPxDTO = z.infer<typeof CrearRecepcionPxSchema>;
