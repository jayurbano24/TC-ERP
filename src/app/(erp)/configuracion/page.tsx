"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, Badge, Button, notify, confirmDialog } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { 
  Settings, 
  Cpu, 
  Tag, 
  Hash, 
  Plus, 
  Trash2, 
  Edit3, 
  Save,
  Layers,
  CheckCircle2,
  AlertTriangle,
  X,
  Stethoscope,
  Wrench,
  Activity,
  ClipboardList,
  Truck,
  CheckSquare,
  Users,
  Palette,
  Package
} from 'lucide-react';
import { useAuthz } from '@/components/authz';
import { canConfigureThemes } from '@/lib/design/seasonal-presets';
import { ThemeColorsView } from './components/ThemeColorsView';
import { 
  getTechnologies, saveTechnology, deleteTechnology,
  getBrands, saveBrand, deleteBrand,
  getModels, saveModel, deleteModel,
  getAgencies, saveAgency, deleteAgency, saveAgenciesBulk, deleteAgenciesBulk,
  getCarriers, saveCarrier, deleteCarrier,
  getDiagnostics, saveDiagnosticConfig, deleteDiagnosticConfig,
  getRepairs, saveRepair, deleteRepair,
  getProfiles, saveProfile,
  getReacondicionadoTests, saveReacondicionadoTest, deleteReacondicionadoTest,
  getPxProviders, savePxProvider, deletePxProvider,
  getReturnReasons, saveReturnReason, deleteReturnReason
} from '@/shared/catalogs/catalogs';
import { adminChangeUserPassword } from '@/app/actions/admin';
import { ConfigModal } from './components/ConfigModal';
import { AgenciasView } from './components/AgenciasView';
import { CatalogTableView } from './components/CatalogTableView';
import { PiezasCatalogView } from './components/PiezasCatalogView';
import {
  countCatalogDuplicates,
  countModelDuplicates,
  dedupeCatalogByName,
  findDuplicateCatalogName,
  annotateModelDuplicates,
  normalizeCatalogName,
} from '@/shared/catalogs/catalogNameDedup';
import {
  exportDiagnosticsCsv,
  exportReacondicionadoCsv,
  exportRepairsCsv,
  findCatalogIdByName,
  resolveCatalogIdsFromNames,
  resolveRepairIdsFromNames,
  WORKSHOP_CATALOG_PAGE_SIZE,
} from './utils/workshopCatalogCsv';
import { readCatalogSpreadsheet } from './utils/catalogExcel';
import {
  exportAgenciesCsv,
  exportBrandsCsv,
  exportCarriersCsv,
  exportPxProvidersCsv,
  exportReturnReasonsCsv,
  exportTechnologiesCsv,
  findCarrierDbIdByCode,
  parseDigitsPerSeries,
} from './utils/configCatalogCsv';

type Marca = { id: string; nombre: string };
type Modelo = { 
  id: string; 
  marcaId: string; 
  nombre: string; 
  tecnologiaId: string;
  seriesCount: number;
  digitsPerSeries: number[]; // Array para longitud independiente por serie
};
type Tecnologia = { 
  id: string; 
  nombre: string; 
  seriesCount: number; 
  digitsPerSeries: number[]; 
};

type Reparacion = {
  id: string;
  nombre: string;
};

type Diagnostico = {
  id: string;
  nombre: string;
  reparacionesIds: string[];
};

type ReacondicionadoTest = {
  id: string;
  nombre: string;
  technologyIds: string[];
  modelIds: string[];
};

type Agencia = {
  id: string;
  nombre: string;
  encargado: string;
  email: string;
  telefono: string;
  direccion: string;
};

export default function ConfiguracionPage() {
  const { email: authzEmail, roleLabel, isLoading: authzLoading, snapshot } = useAuthz();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const resolvedEmail = authzEmail || snapshot.email || sessionEmail;
  const canEditThemes = canConfigureThemes(resolvedEmail);
  const [activeView, setActiveView] = useState<'tema' | 'marcas' | 'modelos' | 'tecnologias' | 'diagnosticos' | 'reparaciones' | 'reacondicionado' | 'agencias' | 'transportes' | 'usuarios' | 'px_providers' | 'razones_devolucion' | 'piezas'>('marcas');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setSessionEmail(data.user?.email ?? null);
      } catch {
        if (!cancelled) setSessionEmail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authzLoading && !canEditThemes && activeView === 'tema') {
      setActiveView('marcas');
    }
  }, [authzLoading, canEditThemes, activeView]);
  const [modalType, setModalType] = useState<'marca' | 'modelo' | 'tecnologia' | 'diagnostico' | 'reparacion' | 'reacondicionado' | 'agencia' | 'transporte' | 'usuario' | 'px_provider' | 'razon_devolucion'>('marca');
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [tecnologias, setTecnologias] = useState<Tecnologia[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([]);
  const [reacondicionadoTests, setReacondicionadoTests] = useState<ReacondicionadoTest[]>([]);
  const [agencias, setAgencias] = useState<any[]>([]);
  const [transportes, setTransportes] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [pxProviders, setPxProviders] = useState<any[]>([]);
  const [razonesDevolucion, setRazonesDevolucion] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<Set<string>>(new Set());

  const reparacionesLista = useMemo(() => dedupeCatalogByName(reparaciones), [reparaciones]);
  const diagnosticosLista = useMemo(() => dedupeCatalogByName(diagnosticos), [diagnosticos]);
  const reparacionesDuplicadas = useMemo(() => countCatalogDuplicates(reparaciones), [reparaciones]);
  const diagnosticosDuplicados = useMemo(() => countCatalogDuplicates(diagnosticos), [diagnosticos]);
  const modelosTabla = useMemo(() => annotateModelDuplicates(modelos), [modelos]);
  const modelosDuplicados = useMemo(() => countModelDuplicates(modelos), [modelos]);

  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [t, b, m, a, c, d, r, u, rt, px, rr] = await Promise.all([
        getTechnologies(),
        getBrands(),
        getModels(),
        getAgencies(),
        getCarriers(),
        getDiagnostics(),
        getRepairs(),
        getProfiles(),
        getReacondicionadoTests(),
        getPxProviders(),
        getReturnReasons()
      ]);
      setTecnologias(t.map((x: any) => ({ ...x, nombre: x.name, seriesCount: x.series_count, digitsPerSeries: x.digits_per_series })));
      setTransportes(c.map((x: any) => ({ dbId: x.id, id: x.code, nombre: x.name })));
      setMarcas(b.map((x: any) => ({ ...x, nombre: x.name })));
      setModelos(m.map((x: any) => ({ 
        ...x, 
        nombre: x.name, 
        marcaId: x.brand_id, 
        tecnologiaId: x.technology_id,
        seriesCount: x.series_count,
        digitsPerSeries: x.digits_per_series
      })));
      setDiagnosticos(d);
      setReparaciones(r.map((x: any) => ({ id: x.id, nombre: x.name })));
      setReacondicionadoTests(rt.map((x: any) => ({ id: x.id, nombre: x.name, technologyIds: x.technology_ids || [], modelIds: x.model_ids || [] })));
      setAgencias(a.map((x: any) => ({ ...x, dbId: x.id, id: x.code, nombre: x.name, encargado: x.manager, telefono: x.phone, direccion: x.address })));
      setUsuarios(u);
      setPxProviders(px.map((x: any) => ({ ...x, nombre: x.name })));
      setRazonesDevolucion(rr.map((x: any) => ({ ...x, nombre: x.name })));
      setLoading(false);
    };
    loadData();
  }, []);


  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = WORKSHOP_CATALOG_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(agencias.length / itemsPerPage));
  const paginatedAgencias = agencias.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const agencyRangeStart = agencias.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const agencyRangeEnd = Math.min(currentPage * itemsPerPage, agencias.length);

  // Form State
  const [formData, setFormData] = useState<any>({});

  const handleOpenModal = (type: any, item: any = null) => {
    setModalType(type);
    setEditingItem(item);
    if (item) {
      setFormData(item);
    } else {
      setFormData(type === 'tecnologia' ? { seriesCount: 1, digitsPerSeries: [12] } : type === 'modelo' ? { seriesCount: 2, digitsPerSeries: [12, 12] } : {});
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (modalType === 'marca') {
        const { error } = await saveBrand({ ...editingItem, ...formData });
        if (!error) {
          const b = await getBrands();
          setMarcas(b.map((x: any) => ({ ...x, nombre: x.name })));
        } else {
          const errMsg = typeof error === 'string' ? error : (error as any)?.message;
          notify.error('Error al guardar marca', { description: errMsg || 'Conflicto de código o nombre' });
        }
      } else if (modalType === 'modelo') {
        const { error } = await saveModel({ ...editingItem, ...formData });
        if (!error) {
          const m = await getModels();
          setModelos(m.map((x: any) => ({ ...x, nombre: x.name, marcaId: x.brand_id, tecnologiaId: x.technology_id, seriesCount: x.series_count, digitsPerSeries: x.digits_per_series })));
        } else {
          const errMsg = typeof error === 'string' ? error : (error as any)?.message;
          notify.error('Error al guardar modelo', { description: errMsg || 'Nombre duplicado para esta marca' });
          setLoading(false);
          return;
        }
      } else if (modalType === 'tecnologia') {
        const { error } = await saveTechnology({ 
          ...editingItem, 
          name: formData.nombre,
          series_count: formData.seriesCount,
          digits_per_series: formData.digitsPerSeries
        });
        if (!error) {
          const t = await getTechnologies();
          setTecnologias(t.map((x: any) => ({ ...x, nombre: x.name, seriesCount: x.series_count, digitsPerSeries: x.digits_per_series })));
        } else {
          const errMsg = typeof error === 'string' ? error : (error as any)?.message;
          notify.error('Error al guardar tecnología', { description: errMsg || 'Conflicto de código o nombre' });
        }
      } else if (modalType === 'agencia') {
        const { error } = await saveAgency({ ...editingItem, ...formData });
        if (!error) {
          const a = await getAgencies();
          setAgencias(a.map((x: any) => ({ 
            dbId: x.id,
            id: x.code, 
            nombre: x.name, 
            encargado: x.manager || '', 
            email: x.email || '', 
            telefono: x.phone || '', 
            direccion: x.address || '' 
          })));
        } else {
          const errAny = error as any;
          notify.error('Error al guardar agencia', { description: typeof error === 'string' ? error : errAny?.message || JSON.stringify(error) });
        }
      } else if (modalType === 'transporte') {
        const { error } = await saveCarrier({ ...editingItem, ...formData });
        if (!error) {
          const c = await getCarriers();
          setTransportes(c.map((x: any) => ({ dbId: x.id, id: x.code, nombre: x.name })));
        } else {
          const errAny = error as any;
          notify.error('Error al guardar transporte', { description: typeof error === 'string' ? error : errAny?.message || JSON.stringify(error) });
        }
      } else if (modalType === 'px_provider') {
        const { error } = await savePxProvider({ ...editingItem, ...formData });
        if (!error) {
          const px = await getPxProviders();
          setPxProviders(px.map((x: any) => ({ ...x, nombre: x.name })));
        } else {
          notify.error('Error al guardar proveedor PX', { description: typeof error === 'string' ? error : (error as any)?.message || JSON.stringify(error) });
        }
      } else if (modalType === 'razon_devolucion') {
        const { error } = await saveReturnReason({ ...editingItem, ...formData });
        if (!error) {
          const rr = await getReturnReasons();
          setRazonesDevolucion(rr.map((x: any) => ({ ...x, nombre: x.name })));
        } else {
          notify.error('Error al guardar razón de devolución', { description: typeof error === 'string' ? error : (error as any)?.message || JSON.stringify(error) });
        }
      } else if (modalType === 'reparacion' || modalType === 'diagnostico') {
        if (modalType === 'reparacion') {
          const { data, error } = await saveRepair({ ...editingItem, ...formData });
          if (!error) {
            const r = await getRepairs();
            setReparaciones(r.map((x: any) => ({ id: x.id, nombre: x.name })));
          } else {
            notify.error('Error al guardar reparación', { description: (error as any)?.message });
            setLoading(false);
            return;
          }
        } else {
          const { error } = await saveDiagnosticConfig({ ...editingItem, ...formData });
          if (!error) {
            const d = await getDiagnostics();
            setDiagnosticos(d);
          } else {
            notify.error('Error al guardar diagnóstico', { description: (error as any)?.message });
            setLoading(false);
            return;
          }
        }
      } else if (modalType === 'reacondicionado') {
        const { error } = await saveReacondicionadoTest({ ...editingItem, ...formData });
        if (!error) {
          const rt = await getReacondicionadoTests();
          setReacondicionadoTests(rt.map((x: any) => ({ id: x.id, nombre: x.name, technologyIds: x.technology_ids || [], modelIds: x.model_ids || [] })));
        } else {
          notify.error('Error al guardar prueba de reacondicionado', { description: (error as any)?.message });
        }
      } else if (modalType === 'usuario') {
        if (formData.password && formData.password !== formData.confirm_password) {
          notify.warning('Las contraseñas no coinciden.');
          setLoading(false);
          return;
        }

        const { error } = await saveProfile({ ...editingItem, full_name: formData.full_name, email: formData.email });
        if (!error) {
          if (formData.password && editingItem?.id) {
            const pwdResult = await adminChangeUserPassword(editingItem.id, formData.password);
            if (pwdResult.error) {
              notify.warning('Usuario guardado, pero falló el cambio de contraseña', { description: pwdResult.error });
            } else {
              notify.success('Usuario actualizado y contraseña cambiada correctamente.');
            }
          }

          const u = await getProfiles();
          setUsuarios(u);
        } else {
          notify.error('Error al guardar usuario', { description: (error as any)?.message || JSON.stringify(error) });
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    setShowModal(false);
  };

  const handleQuickSave = async (type: string, item: any) => {
    setLoading(true);
    try {
      if (type === 'marca') {
        const { error } = await saveBrand(item);
        if (!error) {
          const b = await getBrands();
          setMarcas(b.map((x: any) => ({ ...x, nombre: x.name })));
          notify.success('Marca guardada');
        } else {
          notify.error('Error al guardar marca', { description: typeof error === 'string' ? error : (error as any)?.message });
        }
      } else if (type === 'modelo') {
        const { error } = await saveModel(item);
        if (!error) {
          const m = await getModels();
          setModelos(m.map((x: any) => ({
            ...x,
            nombre: x.name,
            marcaId: x.brand_id,
            tecnologiaId: x.technology_id,
            seriesCount: x.series_count,
            digitsPerSeries: x.digits_per_series,
          })));
          notify.success('Modelo guardado');
        } else {
          notify.error('Error al guardar modelo', {
            description: typeof error === 'string' ? error : (error as any)?.message,
          });
        }
      } else if (type === 'tecnologia') {
        const { error } = await saveTechnology({
          id: item.id,
          name: item.nombre,
          series_count: item.seriesCount,
          digits_per_series: item.digitsPerSeries,
        });
        if (!error) {
          const t = await getTechnologies();
          setTecnologias(t.map((x: any) => ({ ...x, nombre: x.name, seriesCount: x.series_count, digitsPerSeries: x.digits_per_series })));
          notify.success('Tecnología guardada');
        } else {
          notify.error('Error al guardar tecnología', { description: typeof error === 'string' ? error : (error as any)?.message });
        }
      } else if (type === 'agencia') {
        const { error } = await saveAgency(item);
        if (!error) {
          const a = await getAgencies();
          setAgencias(a.map((x: any) => ({
            dbId: x.id,
            id: x.code,
            nombre: x.name,
            encargado: x.manager || '',
            email: x.email || '',
            telefono: x.phone || '',
            direccion: x.address || '',
          })));
          notify.success('Agencia guardada');
        } else {
          notify.error('Error al guardar agencia', { description: typeof error === 'string' ? error : (error as any)?.message });
        }
      } else if (type === 'transporte') {
        const { error } = await saveCarrier({ id: item.dbId, nombre: item.nombre, code: item.id });
        if (!error) {
          const c = await getCarriers();
          setTransportes(c.map((x: any) => ({ dbId: x.id, id: x.code, nombre: x.name })));
          notify.success('Transporte guardado');
        } else {
          notify.error('Error al guardar transporte', { description: typeof error === 'string' ? error : (error as any)?.message });
        }
      } else if (type === 'px_provider') {
        const { error } = await savePxProvider(item);
        if (!error) {
          const px = await getPxProviders();
          setPxProviders(px.map((x: any) => ({ ...x, nombre: x.name })));
          notify.success('Proveedor guardado');
        } else {
          notify.error('Error al guardar proveedor PX', { description: typeof error === 'string' ? error : (error as any)?.message });
        }
      } else if (type === 'razon_devolucion') {
        const { error } = await saveReturnReason(item);
        if (!error) {
          const rr = await getReturnReasons();
          setRazonesDevolucion(rr.map((x: any) => ({ ...x, nombre: x.name })));
          notify.success('Razón guardada');
        } else {
          notify.error('Error al guardar razón', { description: typeof error === 'string' ? error : (error as any)?.message });
        }
      } else if (type === 'reparacion') {
        const { error } = await saveRepair(item);
        if (!error) {
          await reloadWorkshopCatalogs();
          notify.success('Reparación guardada');
        } else {
          notify.error('Error al guardar reparación', { description: (error as any)?.message });
        }
      } else if (type === 'diagnostico') {
        const { error } = await saveDiagnosticConfig(item);
        if (!error) {
          await reloadWorkshopCatalogs();
          notify.success('Diagnóstico guardado');
        } else {
          notify.error('Error al guardar diagnóstico', { description: (error as any)?.message });
        }
      } else if (type === 'reacondicionado') {
        const { error } = await saveReacondicionadoTest(item);
        if (!error) {
          const rt = await getReacondicionadoTests();
          setReacondicionadoTests(rt.map((x: any) => ({ id: x.id, nombre: x.name, technologyIds: x.technology_ids || [], modelIds: x.model_ids || [] })));
          notify.success('Prueba guardada');
        } else {
          notify.error('Error al guardar prueba', { description: (error as any)?.message });
        }
      }
    } catch (err) {
      console.error(err);
      notify.error('No se pudo guardar el registro');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!(await confirmDialog({ title: 'Eliminar registro', message: '¿Está seguro de eliminar este registro?', tone: 'error', confirmText: 'Eliminar' }))) return;
    setLoading(true);
    try {
      if (type === 'marca') {
        await deleteBrand(id);
        setMarcas(marcas.filter(m => m.id !== id));
      } else if (type === 'modelo') {
        const { error } = await deleteModel(id);
        if (error) {
          notify.error('No se pudo eliminar el modelo', {
            description: typeof error === 'string' ? error : (error as any)?.message || String(error),
          });
        } else {
          setModelos(modelos.filter(m => m.id !== id));
          notify.success('Modelo eliminado');
        }
      } else if (type === 'tecnologia') {
        await deleteTechnology(id);
        setTecnologias(tecnologias.filter(t => t.id !== id));
      } else if (type === 'agencia') {
        const { error } = await deleteAgency(id);
        if (error) {
          notify.error('Error al eliminar agencia', { description: (error as any)?.message || JSON.stringify(error) });
        } else {
          setAgencias(agencias.filter(a => a.dbId !== id));
        }
      } else if (type === 'transporte') {
        const { error } = await deleteCarrier(id);
        if (error) {
          notify.error('Error al eliminar transporte', { description: (error as any)?.message || JSON.stringify(error) });
        } else {
          setTransportes(transportes.filter(t => t.dbId !== id));
        }
      } else if (type === 'px_provider') {
        await deletePxProvider(id);
        setPxProviders(pxProviders.filter(p => p.id !== id));
      } else if (type === 'razon_devolucion') {
        await deleteReturnReason(id);
        setRazonesDevolucion(razonesDevolucion.filter(r => r.id !== id));
      } else if (type === 'reparacion') {
        await deleteRepair(id);
        setReparaciones(reparaciones.filter(r => r.id !== id));
      } else if (type === 'diagnostico') {
        await deleteDiagnosticConfig(id);
        setDiagnosticos(diagnosticos.filter(d => d.id !== id));
      } else if (type === 'reacondicionado') {
        await deleteReacondicionadoTest(id);
        setReacondicionadoTests(reacondicionadoTests.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const toggleAgencySelection = (id: string) => {
    const next = new Set(selectedAgencyIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedAgencyIds(next);
  };

  const handleToggleAllAgencies = () => {
    if (selectedAgencyIds.size === agencias.length) {
      setSelectedAgencyIds(new Set());
    } else {
      setSelectedAgencyIds(new Set(agencias.map(a => a.dbId)));
    }
  };

  const handleBulkDeleteAgencies = async () => {
    if (selectedAgencyIds.size === 0) return;
    if (!(await confirmDialog({ title: 'Eliminar agencias', message: `¿Está seguro de eliminar ${selectedAgencyIds.size} agencias seleccionadas?`, tone: 'error', confirmText: 'Eliminar' }))) return;
    
    setLoading(true);
    const idsToDelete = Array.from(selectedAgencyIds);
    const { error } = await deleteAgenciesBulk(idsToDelete);
    
    if (error) {
      notify.error('Error al eliminar agencias en bloque', { description: (error as any)?.message || JSON.stringify(error) });
    } else {
      setAgencias(agencias.filter(a => !selectedAgencyIds.has(a.dbId)));
      setSelectedAgencyIds(new Set());
      notify.success(`Se han eliminado ${idsToDelete.length} agencias.`);
    }
    setLoading(false);
  };

  const handleBulkExport = () => {
    exportAgenciesCsv(agencias);
  };

  const reloadWorkshopCatalogs = async () => {
    const [d, r, rt] = await Promise.all([
      getDiagnostics(),
      getRepairs(),
      getReacondicionadoTests(),
    ]);
    setDiagnosticos(d);
    setReparaciones(r.map((x: { id: string; name: string }) => ({ id: x.id, nombre: x.name })));
    setReacondicionadoTests(
      rt.map((x: { id: string; name: string; technology_ids?: string[]; model_ids?: string[] }) => ({
        id: x.id,
        nombre: x.name,
        technologyIds: x.technology_ids || [],
        modelIds: x.model_ids || [],
      })),
    );
  };

  const handleExportReparaciones = () => {
    exportRepairsCsv(reparaciones);
  };

  const handleExportDiagnosticos = () => {
    exportDiagnosticsCsv(diagnosticos, reparaciones);
  };

  const handleExportReacondicionado = () => {
    exportReacondicionadoCsv(reacondicionadoTests, tecnologias, modelos);
  };

  const handleExportMarcas = () => exportBrandsCsv(marcas);
  const handleExportTecnologias = () => exportTechnologiesCsv(tecnologias);
  const handleExportTransportes = () => exportCarriersCsv(transportes);
  const handleExportPxProviders = () => exportPxProvidersCsv(pxProviders);
  const handleExportRazonesDevolucion = () => exportReturnReasonsCsv(razonesDevolucion);

  const handleImportMarcas = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      for (const row of rows) {
        const nombre = String(row.nombre || row.name || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const existingId = findCatalogIdByName(nombre, marcas);
        const { error } = await saveBrand({ id: existingId, nombre });
        if (error) skipped += 1;
        else ok += 1;
      }
      const b = await getBrands();
      setMarcas(b.map((x: any) => ({ ...x, nombre: x.name })));
      notify.success(`Importación marcas: ${ok} guardadas${skipped ? `, ${skipped} omitidas` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar marcas', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleImportTecnologias = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      for (const row of rows) {
        const nombre = String(row.nombre || row.name || row.tecnologia || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const seriesCount = Math.max(1, parseInt(String(row.cant_series || row.series_count || '1'), 10) || 1);
        const digitsPerSeries = parseDigitsPerSeries(String(row.digitos || row.digits || '12'), seriesCount);
        const existingId = findCatalogIdByName(nombre, tecnologias);
        const { error } = await saveTechnology({
          id: existingId,
          name: nombre,
          series_count: seriesCount,
          digits_per_series: digitsPerSeries,
        });
        if (error) skipped += 1;
        else ok += 1;
      }
      const t = await getTechnologies();
      setTecnologias(t.map((x: any) => ({ ...x, nombre: x.name, seriesCount: x.series_count, digitsPerSeries: x.digits_per_series })));
      notify.success(`Importación tecnologías: ${ok} guardadas${skipped ? `, ${skipped} omitidas` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar tecnologías', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleImportTransportes = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      for (const row of rows) {
        const codigo = String(row.codigo || row.code || row.id || '').trim();
        const nombre = String(row.nombre || row.name || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const dbId = codigo ? findCarrierDbIdByCode(codigo, transportes) : undefined;
        const { error } = await saveCarrier({
          id: dbId,
          nombre,
          code: codigo || nombre.replace(/\s+/g, '_').toUpperCase(),
        });
        if (error) skipped += 1;
        else ok += 1;
      }
      const c = await getCarriers();
      setTransportes(c.map((x: any) => ({ dbId: x.id, id: x.code, nombre: x.name })));
      notify.success(`Importación transportes: ${ok} guardados${skipped ? `, ${skipped} omitidos` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar transportes', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleImportPxProviders = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      for (const row of rows) {
        const nombre = String(row.nombre || row.name || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const existingId = findCatalogIdByName(nombre, pxProviders);
        const { error } = await savePxProvider({ id: existingId, nombre });
        if (error) skipped += 1;
        else ok += 1;
      }
      const px = await getPxProviders();
      setPxProviders(px.map((x: any) => ({ ...x, nombre: x.name })));
      notify.success(`Importación proveedores PX: ${ok} guardados${skipped ? `, ${skipped} omitidos` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar proveedores PX', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleImportRazonesDevolucion = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      for (const row of rows) {
        const nombre = String(row.nombre || row.name || row.razon || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const existingId = findCatalogIdByName(nombre, razonesDevolucion);
        const { error } = await saveReturnReason({ id: existingId, nombre });
        if (error) skipped += 1;
        else ok += 1;
      }
      const rr = await getReturnReasons();
      setRazonesDevolucion(rr.map((x: any) => ({ ...x, nombre: x.name })));
      notify.success(`Importación razones: ${ok} guardadas${skipped ? `, ${skipped} omitidas` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar razones', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleImportReparaciones = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      const seenNames = new Set<string>();
      for (const row of rows) {
        const nombre = String(row.nombre || row.name || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const nameKey = normalizeCatalogName(nombre);
        if (seenNames.has(nameKey)) {
          skipped += 1;
          continue;
        }
        seenNames.add(nameKey);
        const existingId = findCatalogIdByName(nombre, reparaciones);
        if (!existingId) {
          const duplicate = findDuplicateCatalogName(reparaciones, nombre);
          if (duplicate) {
            skipped += 1;
            continue;
          }
        }
        const { error } = await saveRepair({
          id: existingId,
          nombre,
        });
        if (error) skipped += 1;
        else ok += 1;
      }
      await reloadWorkshopCatalogs();
      notify.success(`Importación reparaciones: ${ok} guardadas${skipped ? `, ${skipped} omitidas` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar reparaciones', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImportDiagnosticos = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      const seenNames = new Set<string>();
      for (const row of rows) {
        const nombre = String(row.nombre || row.name || row['falla / diagnóstico'] || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const nameKey = normalizeCatalogName(nombre);
        if (seenNames.has(nameKey)) {
          skipped += 1;
          continue;
        }
        seenNames.add(nameKey);
        const existingId = findCatalogIdByName(nombre, diagnosticos);
        if (!existingId) {
          const duplicate = findDuplicateCatalogName(diagnosticos, nombre);
          if (duplicate) {
            skipped += 1;
            continue;
          }
        }
        const repsRaw = String(row.reparaciones_sugeridas || row.reparaciones || '').trim();
        const reparacionesIds = resolveRepairIdsFromNames(repsRaw, reparaciones);
        const { error } = await saveDiagnosticConfig({
          id: existingId,
          nombre,
          reparacionesIds,
        });
        if (error) skipped += 1;
        else ok += 1;
      }
      await reloadWorkshopCatalogs();
      notify.success(`Importación diagnósticos: ${ok} guardados${skipped ? `, ${skipped} omitidos` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar diagnósticos', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImportReacondicionado = async (file: File) => {
    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      let ok = 0;
      let skipped = 0;
      const seenNames = new Set<string>();
      for (const row of rows) {
        const nombre = String(row.nombre || row.name || row.prueba || '').trim();
        if (!nombre) {
          skipped += 1;
          continue;
        }
        const nameKey = normalizeCatalogName(nombre);
        if (seenNames.has(nameKey)) {
          skipped += 1;
          continue;
        }
        seenNames.add(nameKey);
        const existingId = findCatalogIdByName(nombre, reacondicionadoTests);
        const technologyIds = resolveCatalogIdsFromNames(
          String(row.tecnologias || row.technologies || '*'),
          tecnologias,
        );
        const modelIds = resolveCatalogIdsFromNames(
          String(row.modelos || row.models || '*'),
          modelos,
        );
        const { error } = await saveReacondicionadoTest({
          id: existingId,
          nombre,
          technologyIds,
          modelIds,
        });
        if (error) skipped += 1;
        else ok += 1;
      }
      await reloadWorkshopCatalogs();
      notify.success(`Importación reacondicionado: ${ok} guardadas${skipped ? `, ${skipped} omitidas` : ''}.`);
    } catch (err: unknown) {
      notify.error('No se pudo importar reacondicionado', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLoading(true);
    try {
      const rows = await readCatalogSpreadsheet(file);
      const newAgencias = rows
        .map((row) => ({
          id: String(row.codigo || row.code || row.id || '').trim(),
          nombre: String(row.nombre || row.name || row.agencia || '').trim(),
          encargado: String(row.encargado || row.manager || row.responsable || '').trim(),
          email: String(row.email || row.correo || '').trim(),
          telefono: String(row.telefono || row.phone || row.tel || '').trim(),
          direccion: String(row.direccion || row.address || row.ubicacion || '').trim(),
        }))
        .filter((a) => a.id && a.nombre);

      if (newAgencias.length === 0) {
        notify.warning('No se encontraron filas válidas en el Excel.');
        return;
      }

      const { error } = await saveAgenciesBulk(newAgencias);
      if (!error) {
        const a = await getAgencies();
        setAgencias(
          a.map((x: any) => ({
            dbId: x.id,
            id: x.code,
            nombre: x.name,
            encargado: x.manager || '',
            email: x.email || '',
            telefono: x.phone || '',
            direccion: x.address || '',
          })),
        );
        notify.success(`Se han importado ${newAgencias.length} agencias correctamente.`);
      } else {
        notify.error('Error al guardar', {
          description: (error as any)?.message || JSON.stringify(error),
        });
      }
    } catch (err: unknown) {
      notify.error('No se pudo importar agencias', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  // Actualizar array de dígitos cuando cambia la cantidad de series
  const updateSeriesCount = (count: number) => {
    const newDigits = [...(formData.digitsPerSeries || [])];
    if (count > newDigits.length) {
      for (let i = newDigits.length; i < count; i++) newDigits.push(12);
    } else {
      newDigits.splice(count);
    }
    setFormData({ ...formData, seriesCount: count, digitsPerSeries: newDigits });
  };

  // Filtrar modelos por marca seleccionada en el modal (sin duplicados por nombre)
  const modelsInSelectedBrand = useMemo(
    () => dedupeCatalogByName(modelos.filter((m) => m.marcaId === formData.marcaId)),
    [modelos, formData.marcaId],
  );

  return (
    <ModulePage
      title="Configuración del Sistema"
      category="Administración"
    >
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar de Configuración */}
        <div className="lg:w-64 space-y-2">
          {canEditThemes ? (
            <div className="pb-2">
              <p className="mb-2 px-6 text-[9px] font-black tracking-widest text-neutral-800 uppercase">Apariencia</p>
              <button
                type="button"
                onClick={() => setActiveView('tema')}
                className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'tema' ? 'bg-accent text-accent-foreground shadow-xl' : 'text-black hover:bg-neutral-100 dark:hover:bg-white/5'}`}
                title={roleLabel ? `${roleLabel}` : undefined}
              >
                <Palette size={14} /> Tema / Colores
              </button>
            </div>
          ) : null}

          <button 
            onClick={() => setActiveView('marcas')}
            className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'marcas' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
          >
            <Tag size={14} /> Marcas
          </button>
          <button 
            onClick={() => setActiveView('modelos')}
            className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'modelos' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
          >
            <Layers size={14} /> Modelos
          </button>
          <button 
            onClick={() => setActiveView('tecnologias')}
            className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'tecnologias' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
          >
            <Cpu size={14} /> Tecnologías / Reglas
          </button>
          
          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="mb-2 px-6 text-[9px] font-black tracking-widest text-neutral-800 uppercase">Bodega de Partes</p>
            <button 
              type="button"
              onClick={() => setActiveView('piezas')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'piezas' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <Package size={14} /> Piezas / SKU
            </button>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="mb-2 px-6 text-[9px] font-black tracking-widest text-neutral-800 uppercase">Soporte Técnico</p>
            <button 
              onClick={() => setActiveView('diagnosticos')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'diagnosticos' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <Stethoscope size={14} /> Falla Diagnóstico
            </button>
            <button 
              onClick={() => setActiveView('reparaciones')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'reparaciones' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <Wrench size={14} /> Reparaciones
            </button>
            <button 
              onClick={() => setActiveView('reacondicionado')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'reacondicionado' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <CheckSquare size={14} /> Reacondicionado
            </button>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="mb-2 px-6 text-[9px] font-black tracking-widest text-neutral-800 uppercase">Logística</p>
            <button 
              onClick={() => setActiveView('agencias')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'agencias' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <Truck size={14} /> Agencias CAC
            </button>
            <button 
              onClick={() => setActiveView('transportes')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'transportes' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <Truck size={14} /> Empresas Logísticas
            </button>
            <button 
              onClick={() => setActiveView('px_providers')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'px_providers' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <ClipboardList size={14} /> Proveedores PX
            </button>
            <button 
              onClick={() => setActiveView('razones_devolucion')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'razones_devolucion' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-black hover:bg-neutral-100'}`}
            >
              <AlertTriangle size={14} /> Razones de Devolución
            </button>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="mb-2 px-6 text-[9px] font-black tracking-widest text-neutral-800 uppercase">Rendimiento</p>
            <a 
              href="/configuracion/metas"
              className="w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all text-[#2ec4f1] hover:bg-[#2ec4f1]/10 bg-white border-2 border-[#2ec4f1]/20"
            >
              <Activity size={14} /> Metas KPI
            </a>
          </div>
        </div>

        {/* Área de Trabajo */}
        <div className="flex-1 space-y-6">
          {activeView === 'tema' && canEditThemes ? <ThemeColorsView /> : null}

          {activeView === 'marcas' && (
            <CatalogTableView
              type="marca"
              theme="light"
              compact
              title="Catálogo de Marcas"
              subtitle="Gestione los fabricantes autorizados en el sistema"
              addLabel="Agregar Marca"
              icon={<Tag className="w-5 h-5 text-[#2ec4f1]" />}
              iconWrapClassName="bg-blue-50 p-2 rounded-xl"
              data={marcas}
              loading={loading}
              emptyIcon={<Tag size={48} className="mx-auto mb-3" />}
              emptyText="No hay marcas registradas"
              paginationLabel="marcas"
              columns={[
                { header: 'Nombre de Fabricante', cell: (m) => <span className="text-xs font-black uppercase text-[#181c3a]">{m.nombre}</span> },
                { header: 'Modelos', cell: (m) => <Badge className="bg-blue-50 text-[#2ec4f1] border-none font-black text-[9px]">{modelos.filter(x => x.marcaId === m.id).length} MODELOS</Badge> },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportMarcas}
              onImport={handleImportMarcas}
            />
          )}

          {activeView === 'px_providers' && (
            <CatalogTableView
              type="px_provider"
              theme="light"
              compact
              title="Catálogo de Proveedores PX"
              subtitle="Gestione los proveedores para el módulo PX"
              addLabel="Agregar Proveedor"
              icon={<ClipboardList className="w-5 h-5 text-indigo-500" />}
              iconWrapClassName="bg-indigo-50 p-2 rounded-xl"
              data={pxProviders}
              loading={loading}
              emptyIcon={<ClipboardList size={48} className="mx-auto mb-3" />}
              emptyText="No hay proveedores registrados"
              paginationLabel="proveedores"
              columns={[
                { header: 'Nombre de Proveedor', cell: (p) => <span className="text-xs font-black uppercase text-[#181c3a]">{p.nombre}</span> },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportPxProviders}
              onImport={handleImportPxProviders}
            />
          )}

          {activeView === 'piezas' && <PiezasCatalogView />}

          {activeView === 'razones_devolucion' && (
            <CatalogTableView
              type="razon_devolucion"
              theme="light"
              compact
              title="Razones de Devolución"
              subtitle="Motivos disponibles al enviar un equipo a devolución"
              addLabel="Agregar Razón"
              icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
              iconWrapClassName="bg-rose-50 p-2 rounded-xl"
              data={razonesDevolucion}
              loading={loading}
              emptyIcon={<AlertTriangle size={48} className="mx-auto mb-3" />}
              emptyText="No hay razones registradas"
              paginationLabel="razones"
              columns={[
                { header: 'Razón', cell: (p) => <span className="text-xs font-black uppercase text-[#181c3a]">{p.nombre}</span> },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportRazonesDevolucion}
              onImport={handleImportRazonesDevolucion}
            />
          )}


          {activeView === 'agencias' && (
            <AgenciasView
              loading={loading}
              agencias={agencias}
              paginatedAgencias={paginatedAgencias}
              selectedAgencyIds={selectedAgencyIds}
              totalPages={totalPages}
              currentPage={currentPage}
              rangeStart={agencyRangeStart}
              rangeEnd={agencyRangeEnd}
              setCurrentPage={setCurrentPage}
              onToggleAll={handleToggleAllAgencies}
              onToggleOne={toggleAgencySelection}
              onBulkDelete={handleBulkDeleteAgencies}
              onBulkImport={handleBulkImport}
              onBulkExport={handleBulkExport}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
            />
          )}

          {activeView === 'tecnologias' && (
            <CatalogTableView
              type="tecnologia"
              theme="dark"
              compact
              title="Reglas por Tecnología"
              subtitle="Validación de series y longitud"
              addLabel="Nueva Regla"
              icon={<Cpu className="w-5 h-5 text-[#2ec4f1]" />}
              iconWrapClassName="bg-[#2ec4f1]/20 p-2 rounded-xl border border-[#2ec4f1]/30"
              data={tecnologias}
              loading={loading}
              emptyIcon={<Cpu size={48} className="mx-auto mb-3" />}
              emptyText="No hay reglas registradas"
              paginationLabel="reglas"
              columns={[
                {
                  header: 'Tecnología',
                  cell: (tech) => (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-slate-50 flex items-center justify-center text-[#181c3a] border border-slate-100">
                        <Layers size={12} />
                      </div>
                      <span className="text-xs font-black uppercase text-[#181c3a]">{tech.nombre}</span>
                    </div>
                  ),
                },
                {
                  header: 'Cant. Series',
                  cell: (tech) => (
                    <Badge className="bg-blue-50 text-[#2ec4f1] border-none font-black text-[9px]">{tech.seriesCount} CAMPOS</Badge>
                  ),
                },
                {
                  header: 'Dígitos',
                  cell: (tech) => (
                    <span className="text-[10px] font-mono font-bold text-slate-500">{tech.digitsPerSeries?.join(' / ') || 'N/A'}</span>
                  ),
                },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportTecnologias}
              onImport={handleImportTecnologias}
            />
          )}


          {activeView === 'modelos' && (
            <CatalogTableView
              type="modelo"
              theme="light"
              compact
              pageSize={16}
              title="Gestión de Modelos"
              subtitle="Vincule marcas con sus respectivos equipos"
              addLabel="Agregar Modelo"
              icon={<Layers className="w-5 h-5 text-emerald-500" />}
              iconWrapClassName="bg-emerald-50 p-2 rounded-xl"
              data={modelosTabla}
              loading={loading}
              metaHint={
                modelosDuplicados > 0
                  ? `${modelosDuplicados} modelo(s) duplicado(s) — elimine los extras (misma marca + nombre)`
                  : undefined
              }
              emptyIcon={<Layers size={48} className="mx-auto mb-3" />}
              emptyText="No hay modelos registrados"
              paginationLabel="modelos"
              columns={[
                {
                  header: 'Marca',
                  cell: (mod) => {
                    const marca = marcas.find((m) => m.id === mod.marcaId);
                    return (
                      <Badge className="border-neutral-200 bg-neutral-100 px-1.5 py-0 text-[9px] font-bold uppercase text-black !text-black">
                        {marca?.nombre || '—'}
                      </Badge>
                    );
                  },
                },
                {
                  header: 'Nombre del modelo',
                  cell: (mod) => {
                    const tech = tecnologias.find((t) => t.id === mod.tecnologiaId);
                    return (
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-bold truncate ${mod.esDuplicado ? 'text-rose-600' : 'text-black'}`}>
                            {mod.nombre}
                          </span>
                          {mod.esDuplicado ? (
                            <Badge className="border-none bg-rose-100 px-1 py-0 text-[8px] font-black uppercase text-rose-700">
                              Duplicado
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-600">
                          {tech?.nombre || '—'}
                        </span>
                      </div>
                    );
                  },
                },
                {
                  header: 'Reglas (S/D)',
                  cell: (mod) => (
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="blue" className="border-none bg-[#2ec4f1]/10 px-1.5 py-0 text-[9px] text-[#0e7490]">
                        {mod.seriesCount} Series
                      </Badge>
                      <Badge className="border-neutral-200 bg-neutral-100 px-1.5 py-0 text-[9px] text-black !text-black">
                        {mod.digitsPerSeries?.join('/')} Dig.
                      </Badge>
                    </div>
                  ),
                },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
            />
          )}

          {activeView === 'diagnosticos' && (
            <CatalogTableView
              type="diagnostico"
              theme="light"
              compact
              title="Catálogo de Fallas"
              subtitle="Diagnósticos y reparaciones sugeridas"
              addLabel="Nueva Falla"
              icon={<Activity className="w-5 h-5 text-amber-500" />}
              iconWrapClassName="bg-amber-50 p-2 rounded-xl"
              data={diagnosticosLista}
              loading={loading}
              metaHint={
                diagnosticosDuplicados > 0
                  ? `${diagnosticosDuplicados} registro(s) duplicado(s) ocultos — edite o elimine duplicados en BD`
                  : undefined
              }
              emptyIcon={<Activity size={48} className="mx-auto mb-3" />}
              emptyText="No hay diagnósticos registrados"
              columns={[
                {
                  header: 'Falla / Diagnóstico',
                  cell: (diag) => (
                    <span className="text-xs font-black uppercase text-[#181c3a]">{diag.nombre}</span>
                  ),
                },
                {
                  header: 'Reparaciones sugeridas',
                  cell: (diag) => (
                    <div className="flex flex-wrap gap-1">
                      {diag.reparacionesIds.length > 0 ? (
                        diag.reparacionesIds.map((rid: string) => {
                          const rep = reparaciones.find((r) => r.id === rid);
                          return (
                            <Badge
                              key={rid}
                              className="border-neutral-200 bg-neutral-100 px-1.5 py-0 text-[9px] font-bold uppercase text-black !text-black"
                            >
                              {rep?.nombre || 'Desconocida'}
                            </Badge>
                          );
                        })
                      ) : (
                        <span className="text-[10px] font-medium italic text-neutral-500">Sin reparaciones</span>
                      )}
                    </div>
                  ),
                },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportDiagnosticos}
              onImport={handleImportDiagnosticos}
              paginationLabel="diagnósticos"
            />
          )}

          {activeView === 'reparaciones' && (
            <CatalogTableView
              type="reparacion"
              theme="dark"
              compact
              title="Maestro de Reparaciones"
              subtitle="Lista global de acciones técnicas"
              addLabel="Nueva Reparación"
              icon={<Wrench className="w-5 h-5 text-[#2ec4f1]" />}
              iconWrapClassName="bg-[#2ec4f1]/20 p-2 rounded-xl border border-[#2ec4f1]/30"
              data={reparacionesLista}
              loading={loading}
              metaHint={
                reparacionesDuplicadas > 0
                  ? `${reparacionesDuplicadas} registro(s) duplicado(s) ocultos — edite o elimine duplicados en BD`
                  : undefined
              }
              emptyIcon={<Wrench size={48} className="mx-auto mb-3" />}
              emptyText="No hay reparaciones registradas"
              columns={[
                {
                  header: 'Descripción técnica',
                  cell: (r) => (
                    <span className="text-xs font-black uppercase text-[#181c3a]">{r.nombre}</span>
                  ),
                },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportReparaciones}
              onImport={handleImportReparaciones}
              paginationLabel="reparaciones"
            />
          )}

          {activeView === 'reacondicionado' && (
            <CatalogTableView
              type="reacondicionado"
              theme="dark"
              compact
              title="Pruebas de Reacondicionado"
              subtitle="Catálogo de pruebas y vinculaciones"
              addLabel="Nueva Prueba"
              icon={<CheckSquare className="w-5 h-5 text-emerald-400" />}
              iconWrapClassName="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30"
              data={reacondicionadoTests}
              loading={loading}
              emptyIcon={<CheckSquare size={48} className="mx-auto mb-3" />}
              emptyText="No hay pruebas registradas"
              paginationLabel="pruebas"
              columns={[
                {
                  header: 'Prueba',
                  cell: (rt) => (
                    <span className="text-xs font-black uppercase text-[#181c3a]">{rt.nombre}</span>
                  ),
                },
                {
                  header: 'Vinculación (Tec / Modelo)',
                  cell: (rt) => {
                    const selectedTechs = tecnologias.filter((t) => rt.technologyIds?.includes(t.id));
                    const selectedModels = modelos.filter((m) => rt.modelIds?.includes(m.id));
                    return (
                      <div className="flex flex-wrap gap-1">
                        {selectedTechs.length > 0 ? (
                          selectedTechs.map((tech) => (
                            <Badge
                              key={tech.id}
                              variant="slate"
                              className="border-none bg-slate-100 px-1.5 py-0 text-[9px] font-bold uppercase text-slate-600"
                            >
                              {tech.nombre}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="slate" className="border-none bg-slate-50 px-1.5 py-0 text-[9px] font-bold uppercase text-slate-400">
                            TODAS LAS TECNOLOGÍAS
                          </Badge>
                        )}
                        {selectedModels.length > 0 ? (
                          selectedModels.map((mod) => (
                            <Badge
                              key={mod.id}
                              variant="slate"
                              className="border-none bg-slate-100 px-1.5 py-0 text-[9px] font-bold uppercase text-slate-600"
                            >
                              {mod.nombre}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="slate" className="border-none bg-slate-50 px-1.5 py-0 text-[9px] font-bold uppercase text-slate-400">
                            TODOS LOS MODELOS
                          </Badge>
                        )}
                      </div>
                    );
                  },
                },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportReacondicionado}
              onImport={handleImportReacondicionado}
              paginationLabel="pruebas"
            />
          )}

          {activeView === 'transportes' && (
            <CatalogTableView
              type="transporte"
              theme="dark"
              compact
              title="Transporte Logístico"
              subtitle="Catálogo de empresas de transporte"
              addLabel="Nuevo Transporte"
              icon={<Truck className="w-5 h-5 text-[#2ec4f1]" />}
              iconWrapClassName="bg-[#2ec4f1]/20 p-2 rounded-xl border border-[#2ec4f1]/30"
              data={transportes}
              idField="dbId"
              loading={loading}
              emptyIcon={<Truck size={48} className="mx-auto mb-3" />}
              emptyText="No hay empresas de transporte configuradas"
              paginationLabel="transportes"
              columns={[
                { header: 'Código', cell: (t) => <span className="font-mono text-[10px] text-slate-500">{t.id}</span> },
                { header: 'Nombre', cell: (t) => <span className="text-xs font-black uppercase text-[#181c3a]">{t.nombre}</span> },
              ]}
              onOpenModal={handleOpenModal}
              onQuickSave={handleQuickSave}
              onDelete={handleDelete}
              onExport={handleExportTransportes}
              onImport={handleImportTransportes}
            />
          )}


        </div>
      </div>

      {/* Modal Genérico de Configuración */}
      {showModal && (
        <ConfigModal
          modalType={modalType}
          editingItem={editingItem}
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          marcas={marcas}
          tecnologias={tecnologias}
          modelos={modelos}
          reparaciones={reparaciones}
          updateSeriesCount={updateSeriesCount}
          modelsInSelectedBrand={modelsInSelectedBrand}
        />
      )}
    </ModulePage>
  );
}
