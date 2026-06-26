import { z } from 'zod';

/**
 * SEC-P1: Esquemas Zod para las rutas de mutación de recepción PX.
 *
 * Centraliza la validación de entrada en el borde HTTP. Se mantiene permisivo con
 * los alias históricos del cliente (sn/s2/s3/s4, workstation) para no romper a los
 * emisores existentes, pero acota tipos y campos antes de tocar la BD vía service role.
 */

const operatorFields = {
  operatorId: z.string().nullish(),
  operatorName: z.string().max(160).optional(),
};

export const guideDataSchema = z.object({
  sap: z.string().min(1, 'El pedido SAP es obligatorio.').max(120),
  docReferencia: z.string().max(160).optional().default(''),
  agencia: z.string().max(160).optional().default(''),
  proveedorPx: z.string().min(1, 'El proveedor PX es obligatorio.').max(160),
  guia: z.string().max(160).optional().default(''),
  piloto: z.string().max(160).optional().default(''),
  courier: z.string().max(160).optional().default(''),
  totalCajasEsperadas: z.coerce.number().int().nonnegative().optional().default(0),
});

export const pxLotSchema = z.object({
  technologyName: z.string().max(160).optional(),
  brandId: z.string().nullish(),
  modelId: z.string().nullish(),
  brandName: z.string().max(160).optional(),
  modelName: z.string().max(160).optional(),
  expectedUnits: z.coerce.number().int().nonnegative(),
  material: z.string().max(160).optional(),
});

// POST /api/recepcion/px
export const startReceptionSchema = z.object({
  guideData: guideDataSchema,
  operatorName: z.string().max(160).optional(),
  operatorId: z.string().nullish(),
  preferredGuideNumber: z.string().max(160).optional(),
});

// PATCH /api/recepcion/px/[id]
export const updateHeaderSchema = z.object({
  guideData: guideDataSchema,
  expectedVersion: z.coerce.number().int(),
  operatorName: z.string().max(160).optional(),
});

// POST /api/recepcion/px/[id]/finalize
export const finalizeSchema = z.object({
  expectedVersion: z.coerce.number().int(),
  varianceReason: z.string().max(2000).optional(),
  variance_reason: z.string().max(2000).optional(),
  ...operatorFields,
});

// POST /api/recepcion/px/[id]/boxes
export const createBoxSchema = z.object({
  boxCode: z.string().min(1, 'boxCode es obligatorio.').max(120),
  lots: z.array(pxLotSchema).optional().default([]),
});

// POST /api/recepcion/px/boxes/[boxId]/scan
export const scanSchema = z
  .object({
    receptionId: z.string().min(1, 'receptionId es obligatorio.'),
    mainSerial: z.string().max(160).optional(),
    sn: z.string().max(160).optional(),
    serialS2: z.string().max(160).nullish(),
    s2: z.string().max(160).nullish(),
    serialS3: z.string().max(160).nullish(),
    s3: z.string().max(160).nullish(),
    serialS4: z.string().max(160).nullish(),
    s4: z.string().max(160).nullish(),
    brandId: z.string().nullish(),
    modelId: z.string().nullish(),
    material: z.string().max(160).nullish(),
    workstationLabel: z.string().max(160).nullish(),
    workstation: z.string().max(160).nullish(),
    ...operatorFields,
  })
  .refine((d) => Boolean(d.mainSerial || d.sn), {
    message: 'mainSerial es obligatorio.',
    path: ['mainSerial'],
  });

// POST /api/recepcion/px/boxes/[boxId]/lots
export const appendLotsSchema = z.object({
  lots: z.array(pxLotSchema).default([]),
});

// POST /api/recepcion/px/boxes/[boxId]/close
export const closeBoxSchema = z.object({
  expectedVersion: z.coerce.number().int(),
  partialReason: z.string().max(2000).optional(),
  partial_reason: z.string().max(2000).optional(),
  ...operatorFields,
});

// POST /api/recepcion/px/boxes/[boxId]/reopen
export const reopenBoxSchema = z.object({
  expectedVersion: z.coerce.number().int(),
  reason: z.string().max(2000).optional(),
  ...operatorFields,
});

// PATCH /api/recepcion/px/boxes/[boxId]/quantity
export const adjustQuantitySchema = z.object({
  newDeclaredQuantity: z.coerce.number().int().nonnegative(),
  expectedVersion: z.coerce.number().int(),
  reason: z.string().min(1, 'reason es obligatorio.').max(2000),
  ...operatorFields,
});

// POST /api/recepcion/px/boxes/[boxId]/promote  &  /lock (POST)
export const operatorOnlySchema = z.object({
  ...operatorFields,
});

// DELETE /api/recepcion/px/boxes/[boxId]/lock
export const releaseLockSchema = z.object({
  operatorId: z.string().nullish(),
  reason: z.string().max(2000).optional(),
});

// DELETE /api/recepcion/px/boxes/[boxId]
export const deleteBoxSchema = z.object({
  receptionId: z.string().min(1, 'receptionId es obligatorio.'),
  expectedVersion: z.coerce.number().int(),
  ...operatorFields,
});

// DELETE /api/recepcion/px/boxes/[boxId]/equipment/[equipmentId]
export const voidEquipmentSchema = z.object({
  receptionId: z.string().min(1, 'receptionId es obligatorio.'),
  mainSerial: z.string().max(160).nullish(),
  sn: z.string().max(160).nullish(),
  ...operatorFields,
});
