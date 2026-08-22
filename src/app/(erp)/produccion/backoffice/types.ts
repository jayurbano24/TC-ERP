export type GuideItem = {
  id: number;
  tipo: string;
  marca: string;
  modelo: string;
  cantidad: number;
  scannedCount: number;
  series: string[][];
  /** Paralelo a series[]: N° de ingreso previsto por unidad (1, 2, …) */
  unitReentryCounts?: number[];
  seriesPerUnit: number;
  sapGroupId: string;
  sapMaterialNumber?: string;
};

export type SapTransferGroup = {
  id: string;
  sapDocument: string;
};

export type CatalogTech = { id: string; nombre: string; seriesCount: number };
export type CatalogBrand = { id: string; nombre: string };
export type CatalogModel = {
  id: string;
  marcaId: string;
  nombre: string;
  tecnologiaId: string;
  seriesCount: number;
  digitsPerSeries: number[];
};
export type CatalogAgency = {
  id: string;
  name: string;
  manager: string;
  email: string;
  direccion: string;
  telefono?: string;
};

export type OperationCategory = 'Equipo' | 'Accesorio' | 'Teléfono' | 'Devolución';

export type ReceptionStep =
  | 'category_selection'
  | 'classification'
  | 'accessories_photos'
  | 'bulk_classify_confirm'
  | 'initial'
  | 'config'
  | 'scanning'
  | 'return_confirmation'
  | 'sub_bodega_transfer'
  | 'completed';

export type BackofficeTab = 'op' | 'history' | 'sub_accesorios' | 'sub_telefonos';
export type BackofficeReception = {
  id: string;
  status: string;
  guide_number: string;
  notes?: string;
  carrier?: string;
  received_by?: string;
  received_by_profile?: { id?: string; full_name?: string | null } | { id?: string; full_name?: string | null }[] | null;
  received_units?: number;
  created_at: string;
  processed_guides?: string[];
  sap_document?: string;
  evidence_url?: string;
  usuario?: string;
  reception_guides?: Array<{
    guide_number?: string;
    category?: string;
    status?: string;
    classified_at?: string;
    classified_by?: string;
    agency?: string;
  }>;
};
