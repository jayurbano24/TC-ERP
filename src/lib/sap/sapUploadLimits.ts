/** Tamaño máximo archivo G985/CSV en POST /api/sap/parse-upload (alineado con proxyClientMaxBodySize 32mb). */
export const SAP_PARSE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

export const SAP_PARSE_UPLOAD_MAX_MB = SAP_PARSE_UPLOAD_MAX_BYTES / 1024 / 1024;
