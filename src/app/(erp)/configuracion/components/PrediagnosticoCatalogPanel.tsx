'use client';

import { useEffect, useState } from 'react';
import { Button, Card, notify } from '@/components/ui';
import {
  deletePrediagnosticoItem,
  getPrediagnosticoItems,
  savePrediagnosticoItem,
} from '@/lib/database/config';

type Tech = { id: string; nombre: string };
type Brand = { id: string; nombre: string };
type Item = {
  id: string;
  nombre: string;
  itemKind: 'cosmetico' | 'funcionamiento';
  technologyIds: string[];
  brandIds: string[];
};

type Props = {
  tecnologias: Tech[];
  marcas: Brand[];
};

export function PrediagnosticoCatalogPanel({ tecnologias, marcas }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [nombre, setNombre] = useState('');
  const [itemKind, setItemKind] = useState<'cosmetico' | 'funcionamiento'>('cosmetico');
  const [technologyIds, setTechnologyIds] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);

  const reload = async () => {
    const rows = await getPrediagnosticoItems();
    setItems(
      rows.map((row: {
        id: string;
        name: string;
        item_kind: 'cosmetico' | 'funcionamiento';
        technology_ids?: string[];
        brand_ids?: string[];
      }) => ({
        id: row.id,
        nombre: row.name,
        itemKind: row.item_kind,
        technologyIds: row.technology_ids || [],
        brandIds: row.brand_ids || [],
      }))
    );
  };

  useEffect(() => {
    void reload();
  }, []);

  const names = (ids: string[], source: { id: string; nombre: string }[]) =>
    ids.length === 0 ? 'Todas' : ids.map((id) => source.find((row) => row.id === id)?.nombre || id).join(', ');

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-sm font-black uppercase tracking-wide">Pre-Diagnóstico</h2>
        <p className="text-xs text-slate-500">
          Ítems por tecnología y marca. Sin marca aplica a todas las marcas de esas tecnologías.
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
                {item.itemKind === 'cosmetico' ? 'Cosmético' : 'Funcionamiento'} · Tec: {names(item.technologyIds, tecnologias)} · Marca: {names(item.brandIds, marcas)}
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
  );
}
