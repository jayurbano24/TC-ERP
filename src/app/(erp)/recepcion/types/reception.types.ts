export type ModuleMode = 'cac' | 'px';
export type ActiveTab = 'scan' | 'history';

export interface GuideData {
  sap: string;
  docReferencia: string;
  agencia: string;
  proveedorPx: string;
  guia: string;
  piloto: string;
  courier: string;
}

export interface CurrentEntry {
  tecnologia: string;
  marca: string;
  modelo: string;
  totalEsperado: number;
}

export interface PxManifestItem {
  id: string;
  boxCode: string;
  tecnologia: string;
  marca: string;
  modelo: string;
  totalEsperado: number;
  material?: string;
}

export interface PxScannedSeries {
  boxCode: string;
  sn: string;
  s2?: string;
  s3?: string;
  s4?: string;
  material?: string;
}

export interface SystemConfig {
  technologies: any[];
  brands: any[];
  models: any[];
  pxProviders: any[];
}

export interface ValidationResult {
  blocked: boolean;
  info: string;
}
