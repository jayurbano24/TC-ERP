import { z } from 'zod';

export const CreateRecepcionSchema = z.object({
  numeroSerie: z.string().min(3),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  tipoDispositivo: z.string().optional(),
  diagnosticoInicial: z.string().optional(),
  fallaReportada: z.string().optional(),
  // Campos PX (Opcionales por defecto, validados en Aggregate si el tipo es PX)
  guiaPx: z.string().optional(),
  transporte: z.string().optional(),
});

export type CreateRecepcionDTO = z.infer<typeof CreateRecepcionSchema>;
