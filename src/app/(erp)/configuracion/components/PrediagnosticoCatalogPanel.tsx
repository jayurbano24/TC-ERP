'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, notify } from '@/components/ui';
import {
  deletePrediagnosticoItem,
  getPrediagnosticoItems,
  getPrediagnosticoModelItemIds,
  savePrediagnosticoItem,
  savePrediagnosticoModelItems,
} from '@/lib/database/config';
import { filterPrediagnosticoCatalogForEquipment } from '@/modules/backoffice/prediagnostico/resolvePrediagnosticoCatalog';
import { itemAppliesToEquipment } from '@/modules/backoffice/prediagnostico/validatePrediagnostico';

type Tech = { id: string; nombre: string };
type Brand = { id: string; nombre: string };
type Model = { id: string; nombre: string; marcaId: string; tecnologiaId: string };

type Item = {
  id: string;
  nombre: string;
  itemKind: 'cosmetico' | 'funcionamiento';
  technologyIds: string[];
  brandIds: string[];
  sortOrder: number;
  active: boolean;
};

type Props = {
  tecnologias: Tech[];
  marcas: Brand[];
  modelos: Model[];
};

function names(ids: string[], source: { id: string; nombre: string }[]) {
  return ids.length === 0 ? 'Todas' : ids.map((id) => source.find((row) => row.id === id)?.nombre || id).join(', ');
}

export function PrediagnosticoCatalogPanel({ tecnologias, marcas, modelos }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [nombre, setNombre] = useState('');
  const [itemKind, setItemKind] = useState<'cosmetico' | 'funcionamiento'>('cosmetico');
  const [technologyIds, setTechnologyIds] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);

  const [configTechId, setConfigTechId] = useState('');
  const [configModelId, setConfigModelId] = useState('');
  const [profileItemIds, setProfileItemIds] = useState<string[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileHasRows, setProfileHasRows] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const reload = useCallback(async () => {
    const rows = await getPrediagnosticoItems();
    setItems(
      rows.map((row: {
        id: string;
        name: string;
        item_kind: 'cosmetico' | 'funcionamiento';
        technology_ids?: string[];
        brand_ids?: string[];
        sort_order?: number;
        active?: boolean;
      }) => ({
        id: row.id,
        nombre: row.name,
        itemKind: row.item_kind,
        technologyIds: row.technology_ids || [],
        brandIds: row.brand_ids || [],
        sortOrder: row.sort_order ?? 0,
        active: row.active !== false,
      }))
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const modelsForTech = useMemo(
    () =>
      modelos
        .filter((m) => !configTechId || m.tecnologiaId === configTechId)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [modelos, configTechId]
  );

  const selectedModel = useMemo(
    () => modelos.find((m) => m.id === configModelId) ?? null,
    [modelos, configModelId]
  );

  const brandIdForModel = selectedModel?.marcaId ?? '';

  useEffect(() => {
    if (!configModelId || !selectedModel) {
      setProfileItemIds([]);
      setProfileLoaded(false);
      setProfileHasRows(false);
      return;
    }
    let cancelled = false;
    void getPrediagnosticoModelItemIds(configModelId).then((ids) => {
      if (cancelled) return;
      setProfileHasRows(ids.length > 0);
      const catalogRows = items
        .filter((row) => row.active)
        .map((row) => ({
          id: row.id,
          name: row.nombre,
          kind: row.itemKind,
          technologyIds: row.technologyIds,
          brandIds: row.brandIds,
          sortOrder: row.sortOrder,
        }));
      const applicable = filterPrediagnosticoCatalogForEquipment(
        catalogRows,
        selectedModel.tecnologiaId,
        brandIdForModel,
        ids.length > 0 ? ids : null
      );
      if (ids.length > 0) {
        setProfileItemIds(applicable.map((row) => row.id));
      } else {
        setProfileItemIds(
          filterPrediagnosticoCatalogForEquipment(
            catalogRows,
            selectedModel.tecnologiaId,
            brandIdForModel,
            null
          ).map((row) => row.id)
        );
      }
      setProfileLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [configModelId, selectedModel, brandIdForModel, items]);

  const configurableItems = useMemo(() => {
    if (!selectedModel) return [];
    return items
      .filter((row) => row.active)
      .filter((row) =>
        itemAppliesToEquipment(
          { technologyIds: row.technologyIds, brandIds: row.brandIds },
          selectedModel.tecnologiaId,
          selectedModel.marcaId
        )
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.nombre.localeCompare(b.nombre, 'es'));
  }, [items, selectedModel]);

  const toggleProfileItem = (itemId: string) => {
    setProfileItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  };

  const saveProfile = async () => {
    if (!configModelId) return;
    setSavingProfile(true);
    const { error } = await savePrediagnosticoModelItems(configModelId, profileItemIds);
    setSavingProfile(false);
    if (error) {
      notify.error('No se pudo guardar la ventana de pre-diagnóstico para este modelo');
      return;
    }
    setProfileHasRows(profileItemIds.length > 0);
    notify.success('Ventana de pre-diagnóstico actualizada');
  };

  const resetProfile = async () => {
    if (!configModelId) return;
    setSavingProfile(true);
    const { error } = await savePrediagnosticoModelItems(configModelId, []);
    setSavingProfile(false);
    if (error) {
      notify.error('No se pudo restablecer el perfil');
      return;
    }
    setProfileHasRows(false);
    setProfileItemIds(configurableItems.map((row) => row.id));
    notify.success('Perfil eliminado: se usan reglas por tecnología y marca');
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide">Catálogo maestro</h2>
          <p className="text-xs text-slate-500">
            Ítems globales por tecnología y marca. Sin selección aplica a todas.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Nombre del ítem"
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold"
          />
          <select
            value={itemKind}
            onChange={(event) => setItemKind(event.target.value as 'cosmetico' | 'funcionamiento')}
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold"
          >
            <option value="cosmetico">Cosmético (Bien / Dañado)</option>
            <option value="funcionamiento">Funcionamiento (Sí / No / N/A)</option>
          </select>
          <select
            multiple
            value={technologyIds}
            onChange={(event) => setTechnologyIds(Array.from(event.target.selectedOptions, (option) => option.value))}
            className="min-h-28 rounded-xl border border-slate-200 p-2 text-sm"
          >
            {tecnologias.map((tech) => (
              <option key={tech.id} value={tech.id}>{tech.nombre}</option>
            ))}
          </select>
          <select
            multiple
            value={brandIds}
            onChange={(event) => setBrandIds(Array.from(event.target.selectedOptions, (option) => option.value))}
            className="min-h-28 rounded-xl border border-slate-200 p-2 text-sm"
          >
            {marcas.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.nombre}</option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void savePrediagnosticoItem({ nombre, itemKind, technologyIds, brandIds }).then(async ({ error }) => {
              if (error) {
                notify.error('No se pudo guardar el ítem');
                return;
              }
              setNombre('');
              setTechnologyIds([]);
              setBrandIds([]);
              await reload();
              notify.success('Ítem de prediagnóstico guardado');
            });
          }}
        >
          Agregar ítem
        </Button>
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="font-bold">{item.nombre}</p>
                <p className="text-[11px] text-slate-500">
                  {item.itemKind === 'cosmetico' ? 'Cosmético' : 'Funcionamiento'} · Tec:{' '}
                  {names(item.technologyIds, tecnologias)} · Marca: {names(item.brandIds, marcas)}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-bold text-rose-600"
                onClick={() => {
                  void deletePrediagnosticoItem(item.id).then(reload);
                }}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide">Ventana por modelo y tecnología</h2>
          <p className="text-xs text-slate-500">
            Elige qué ítems aparecen en pre-diagnóstico (cosméticos y funcionamiento) para un modelo concreto.
            Si no guardas un perfil, se muestran todos los ítems que apliquen por tecnología y marca.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-bold uppercase text-slate-500">
            Tecnología
            <select
              value={configTechId}
              onChange={(event) => {
                setConfigTechId(event.target.value);
                setConfigModelId('');
              }}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case text-slate-900"
            >
              <option value="">Selecciona…</option>
              {tecnologias.map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.nombre}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-bold uppercase text-slate-500">
            Modelo
            <select
              value={configModelId}
              onChange={(event) => setConfigModelId(event.target.value)}
              disabled={!configTechId}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case text-slate-900 disabled:opacity-50"
            >
              <option value="">Selecciona…</option>
              {modelsForTech.map((model) => (
                <option key={model.id} value={model.id}>{model.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        {configModelId && profileLoaded ? (
          <>
            <p className="text-[11px] text-slate-500">
              {profileHasRows
                ? 'Perfil personalizado activo para este modelo.'
                : 'Sin perfil: se muestran todos los ítems aplicables (marca/tecnología).'}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-black uppercase text-slate-600">Cosméticos</p>
                <ul className="space-y-2">
                  {configurableItems
                    .filter((row) => row.itemKind === 'cosmetico')
                    .map((row) => (
                      <li key={row.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={profileItemIds.includes(row.id)}
                            onChange={() => toggleProfileItem(row.id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {row.nombre}
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase text-slate-600">Funcionamiento</p>
                <ul className="space-y-2">
                  {configurableItems
                    .filter((row) => row.itemKind === 'funcionamiento')
                    .map((row) => (
                      <li key={row.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={profileItemIds.includes(row.id)}
                            onChange={() => toggleProfileItem(row.id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {row.nombre}
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={savingProfile} onClick={() => void saveProfile()}>
                Guardar ventana
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={savingProfile || !profileHasRows}
                onClick={() => void resetProfile()}
              >
                Usar reglas por tecnología/marca
              </Button>
            </div>
          </>
        ) : configModelId ? (
          <p className="text-sm text-slate-500">Cargando opciones…</p>
        ) : null}
      </Card>
    </div>
  );
}
