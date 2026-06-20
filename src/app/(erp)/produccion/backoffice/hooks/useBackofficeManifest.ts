'use client';

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import type {
  BackofficeReception,
  CatalogAgency,
  CatalogBrand,
  CatalogModel,
  CatalogTech,
  GuideItem,
  ReceptionStep,
  SapTransferGroup,
} from '../types';

type Params = {
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  activeReception: BackofficeReception | null;
  selectedAgencyId: string;
  category: 'Equipo' | 'Accesorio' | 'Teléfono';
  setReceptionStep: React.Dispatch<React.SetStateAction<ReceptionStep>>;
  setAgencia: React.Dispatch<React.SetStateAction<string>>;
  setSelectedAgencyId: React.Dispatch<React.SetStateAction<string>>;
};

export function useBackofficeManifest({
  MASTER_TECNOLOGIAS,
  MASTER_MARCAS,
  MASTER_MODELOS,
  activeReception,
  setAgencia,
  setSelectedAgencyId,
}: Params) {
  const [guideItems, setGuideItems] = useState<GuideItem[]>([]);
  const [manifestPanelOpen, setManifestPanelOpen] = useState(true);
  const [sapTransferNumber, setSapTransferNumber] = useState('');
  const [sapGroups, setSapGroups] = useState<SapTransferGroup[]>([]);
  const [activeSapGroupId, setActiveSapGroupId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ tipo: '', marca: '', modelo: '', cantidad: 0 });
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [itemSeriesInputs, setItemSeriesInputs] = useState<Record<number, string>>({});

  const activeSapGroup = sapGroups.find((g) => g.id === activeSapGroupId) || null;
  const isActiveSapDocumentFilled = Boolean(activeSapGroup?.sapDocument?.trim());

  const availableBrandsConfig = useMemo(
    () =>
      MASTER_MARCAS.filter(
        (b) => !newItem.tipo || MASTER_MODELOS.some((m) => m.marcaId === b.id && m.tecnologiaId === newItem.tipo)
      ),
    [MASTER_MARCAS, MASTER_MODELOS, newItem.tipo]
  );

  const availableModels = useMemo(
    () =>
      MASTER_MODELOS.filter(
        (m) => (!newItem.tipo || m.tecnologiaId === newItem.tipo) && (!newItem.marca || m.marcaId === newItem.marca)
      ),
    [MASTER_MODELOS, newItem.marca, newItem.tipo]
  );

  const resetManifestState = useCallback(() => {
    setGuideItems([]);
    setSapGroups([]);
    setActiveSapGroupId(null);
    setSapTransferNumber('');
    setNewItem({ tipo: '', marca: '', modelo: '', cantidad: 0 });
    setSelectedItemIdx(null);
    setItemSeriesInputs({});
    setAgencia('');
    setSelectedAgencyId('');
  }, [setAgencia, setSelectedAgencyId]);

  const initSapGroupsForConfig = useCallback(() => {
    const firstId = `sap-${Date.now()}`;
    setSapGroups([{ id: firstId, sapDocument: '' }]);
    setActiveSapGroupId(firstId);
    setSapTransferNumber('');
    setGuideItems([]);
    setAgencia('');
    setSelectedAgencyId('');
  }, [setAgencia, setSelectedAgencyId]);

  const addSapGroup = useCallback(() => {
    const id = `sap-${Date.now()}`;
    setSapGroups((prev) => [...prev, { id, sapDocument: '' }]);
    setActiveSapGroupId(id);
    setSapTransferNumber('');
  }, []);

  const selectSapGroup = useCallback(
    (groupId: string) => {
      setActiveSapGroupId(groupId);
      const g = sapGroups.find((x) => x.id === groupId);
      setSapTransferNumber(g?.sapDocument || '');
    },
    [sapGroups]
  );

  const updateActiveSapDocument = useCallback(
    (value: string) => {
      if (!activeSapGroupId) return;
      setSapTransferNumber(value);
      setSapGroups((prev) => prev.map((g) => (g.id === activeSapGroupId ? { ...g, sapDocument: value } : g)));
    },
    [activeSapGroupId]
  );

  const removeSapGroup = useCallback(
    (groupId: string) => {
      const group = sapGroups.find((g) => g.id === groupId);
      const itemsInGroup = guideItems.filter((i) => i.sapGroupId === groupId);
      const label = group?.sapDocument.trim() || 'sin número';
      const msg =
        itemsInGroup.length > 0
          ? `¿Eliminar Documento SAP "${label}" y sus ${itemsInGroup.length} ítem(s) del manifiesto?`
          : `¿Eliminar Documento SAP "${label}"?`;
      if (!window.confirm(msg)) return;
      if (sapGroups.length <= 1) {
        alert('Debe conservar al menos un Documento SAP en el manifiesto.');
        return;
      }
      setGuideItems((prev) => prev.filter((i) => i.sapGroupId !== groupId));
      setSapGroups((prev) => {
        const next = prev.filter((g) => g.id !== groupId);
        if (activeSapGroupId === groupId) {
          const first = next[0];
          setActiveSapGroupId(first?.id ?? null);
          setSapTransferNumber(first?.sapDocument || '');
        }
        return next;
      });
    },
    [activeSapGroupId, guideItems, sapGroups]
  );

  const addItem = useCallback(() => {
    if (!activeSapGroupId || !activeSapGroup?.sapDocument.trim()) {
      alert('Seleccione o cree un Documento SAP antes de agregar equipos al manifiesto.');
      return;
    }
    if (!newItem.tipo || !newItem.marca || !newItem.modelo || newItem.cantidad <= 0) {
      const msg = `Faltan campos por completar: ${!newItem.tipo ? 'Tecnología, ' : ''}${!newItem.marca ? 'Marca, ' : ''}${!newItem.modelo ? 'Modelo, ' : ''}${newItem.cantidad <= 0 ? 'Cantidad' : ''}`;
      alert(msg);
      return;
    }
    const selectedModel = MASTER_MODELOS.find((m) => m.id === newItem.modelo);
    const tech = MASTER_TECNOLOGIAS.find((t) => t.id === newItem.tipo);
    const seriesPerUnit = selectedModel?.seriesCount || tech?.seriesCount || 1;
    const item: GuideItem = {
      ...newItem,
      id: Date.now(),
      series: [],
      scannedCount: 0,
      seriesPerUnit,
      sapGroupId: activeSapGroupId,
    };
    setGuideItems((prev) => [...prev, item]);
    setNewItem({ tipo: '', marca: '', modelo: '', cantidad: 0 });
  }, [MASTER_MODELOS, MASTER_TECNOLOGIAS, activeSapGroup, activeSapGroupId, newItem]);

  return {
    guideItems,
    setGuideItems,
    manifestPanelOpen,
    setManifestPanelOpen,
    sapTransferNumber,
    setSapTransferNumber,
    sapGroups,
    setSapGroups,
    activeSapGroupId,
    setActiveSapGroupId,
    newItem,
    setNewItem,
    selectedItemIdx,
    setSelectedItemIdx,
    itemSeriesInputs,
    setItemSeriesInputs,
    availableBrandsConfig,
    availableModels,
    isActiveSapDocumentFilled,
    initSapGroupsForConfig,
    addSapGroup,
    selectSapGroup,
    removeSapGroup,
    updateActiveSapDocument,
    addItem,
    resetManifestState,
    activeReception,
  };
}
