/**
 * Compatibilidad: la fuente única de verdad de la validación SAP vive ahora en
 * el módulo `@/modules/sap-integration`. Este archivo re-exporta el dominio para
 * no romper los consumidores existentes. Las implementaciones nuevas deben
 * importar desde `@/modules/sap-integration` (port `ISapValidationReader`).
 */
export * from '@/modules/sap-integration/domain/sap-validation-status';
