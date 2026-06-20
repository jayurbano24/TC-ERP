'use client';

import { useCallback, useState } from 'react';
import { getTechnologies, getBrands, getModels, getAgencies } from '@/lib/database/config';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../types';

export function useBackofficeCatalogs() {
  const [CAC_AGENCIES, setCAC_AGENCIES] = useState<CatalogAgency[]>([]);
  const [MASTER_TECNOLOGIAS, setMASTER_TECNOLOGIAS] = useState<CatalogTech[]>([]);
  const [MASTER_MARCAS, setMASTER_MARCAS] = useState<CatalogBrand[]>([]);
  const [MASTER_MODELOS, setMASTER_MODELOS] = useState<CatalogModel[]>([]);

  const loadCatalogs = useCallback(async () => {
    try {
      const [techs, brands, models, agencies] = await Promise.all([
        getTechnologies(),
        getBrands(),
        getModels(),
        getAgencies(),
      ]);
      setMASTER_TECNOLOGIAS(
        techs.map((t: any) => ({ id: t.id, nombre: t.name, seriesCount: t.series_count || 1 }))
      );
      setMASTER_MARCAS(brands.map((b: any) => ({ id: b.id, nombre: b.name })));
      setMASTER_MODELOS(
        models.map((m: any) => ({
          id: m.id,
          marcaId: m.brand_id,
          nombre: m.name,
          tecnologiaId: m.technology_id,
          seriesCount: m.series_count || 1,
          digitsPerSeries: m.digits_per_series || [12],
        }))
      );
      setCAC_AGENCIES(
        agencies.map((a: any) => ({
          id: a.code,
          name: a.name,
          manager: a.manager || 'Encargado Pendiente',
          email: a.email || 'correo@agencia.com',
          direccion: a.address || 'Dirección no registrada',
          telefono: a.phone || '000-000-0000',
        }))
      );
    } catch (err) {
      console.error('Error loading catalogs from Supabase:', err);
    }
  }, []);

  const resolveSeriesPerUnit = useCallback(
    (modelId: string) => MASTER_MODELOS.find((m) => m.id === modelId)?.seriesCount || 1,
    [MASTER_MODELOS]
  );

  return {
    CAC_AGENCIES,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    loadCatalogs,
    resolveSeriesPerUnit,
  };
}
