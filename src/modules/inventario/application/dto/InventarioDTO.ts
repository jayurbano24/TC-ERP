import { z } from 'zod';

export const CreateInventarioSchema = z.object({
  sku: z.string().min(1, 'El SKU es obligatorio'),
  cantidad: z.number().positive('La cantidad debe ser mayor a cero'),
  ubicacion: z.string().optional()
});

export type CreateInventarioDTO = z.infer<typeof CreateInventarioSchema>;
