"use client";

import React, { useEffect, useState } from 'react';
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
  const itemsPerPage = 10;
  const totalPages = Math.ceil(agencias.length / itemsPerPage);
  const paginatedAgencias = agencias.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
          notify.error('Error al guardar modelo', { description: errMsg || 'Conflicto de código o nombre' });
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
          }
        } else {
          const { error } = await saveDiagnosticConfig({ ...editingItem, ...formData });
          if (!error) {
            const d = await getDiagnostics();
            setDiagnosticos(d);
          } else {
            notify.error('Error al guardar diagnóstico', { description: (error as any)?.message });
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

  // Funciones para Gestión Masiva de Agencias
  const handleBulkExport = () => {
    const headers = "ID,Nombre,Encargado,Email,Telefono,Direccion\n";
    const rows = agencias.map(a => `${a.id},${a.nombre},${a.encargado},${a.email},${a.telefono},${a.direccion}`).join("\n");
    const blob = new Blob(["\ufeff" + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `directorio_agencias_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    const clean = (s: any) => {
      if (s === null || s === undefined) return '';
      return String(s).trim()
        .replace(/\0/g, '')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
        .replace(/^"|"$/g, '')
        .replace(/""/g, '"');
    };

    const processData = async (rows: any[]) => {
      if (rows.length < 2) return;

      const headers = rows[0].map((h: any) => clean(h).toLowerCase());
      const findIndex = (keywords: string[]) => 
        headers.findIndex((h: string) => keywords.some(k => h.includes(k)));

      const mapping = {
        id: findIndex(['id', 'codigo', 'code']),
        nombre: findIndex(['nombre', 'agencia', 'name']),
        encargado: findIndex(['encargado', 'manager', 'responsable', 'person']),
        email: findIndex(['email', 'correo', 'mail']),
        telefono: findIndex(['telefono', 'phone', 'tel', 'celular']),
        direccion: findIndex(['direccion', 'address', 'ubicacion', 'tienda'])
      };

      const useDefault = mapping.id === -1 && mapping.nombre === -1;
      const newAgencias: any[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 1) continue;
        
        newAgencias.push({
          id: clean(row[useDefault ? 0 : (mapping.id !== -1 ? mapping.id : 0)]),
          nombre: clean(row[useDefault ? 1 : (mapping.nombre !== -1 ? mapping.nombre : 1)]),
          encargado: clean(mapping.encargado !== -1 ? row[mapping.encargado] : (useDefault ? row[2] : '')),
          email: clean(mapping.email !== -1 ? row[mapping.email] : (useDefault ? row[3] : '')),
          telefono: clean(mapping.telefono !== -1 ? row[mapping.telefono] : (useDefault ? row[4] : '')),
          direccion: clean(mapping.direccion !== -1 ? row[mapping.direccion] : (useDefault ? row[5] : ''))
        });
      }

      if (newAgencias.length > 0) {
        setLoading(true);
        const { error } = await saveAgenciesBulk(newAgencias);
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
          notify.success(`Se han importado ${newAgencias.length} agencias correctamente.`);
        } else {
          notify.error('Error al guardar', { description: (error as any)?.message || JSON.stringify(error) });
        }
        setLoading(false);
      }
    };

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        
        // Cargar librería XLSX dinámicamente si no existe
        if (!(window as any).XLSX) {
          const script = document.createElement('script');
          script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
          script.onload = () => {
            const workbook = (window as any).XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonRows = (window as any).XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            processData(jsonRows);
          };
          document.head.appendChild(script);
        } else {
          const workbook = (window as any).XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonRows = (window as any).XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          processData(jsonRows);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Proceso normal para CSV
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n");
        const rows = lines.map(line => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/));
        processData(rows);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
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

  // Filtrar modelos por marca seleccionada en el modal
  const modelsInSelectedBrand = modelos.filter(m => m.marcaId === formData.marcaId);

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
              title="Catálogo de Marcas"
              subtitle="Gestione los fabricantes autorizados en el sistema"
              addLabel="Agregar Marca"
              icon={<Tag className="w-6 h-6 text-[#2ec4f1]" />}
              iconWrapClassName="bg-blue-50 p-3 rounded-2xl shadow-lg shadow-blue-500/10"
              data={marcas}
              loading={loading}
              emptyIcon={<Tag size={64} className="mx-auto mb-4" />}
              emptyText="No hay marcas registradas"
              columns={[
                { header: 'ID', cell: (m) => <span className="font-mono text-[10px] text-slate-400">#{m.id.substring(0,8)}</span> },
                { header: 'Nombre de Fabricante', cell: (m) => <span className="font-black text-[#181c3a] uppercase text-sm tracking-tight">{m.nombre}</span> },
                { header: 'Modelos Vinculados', cell: (m) => <Badge className="bg-blue-50 text-[#2ec4f1] border-none font-black text-[10px]">{modelos.filter(x => x.marcaId === m.id).length} MODELOS</Badge> },
              ]}
              onOpenModal={handleOpenModal}
              onDelete={handleDelete}
            />
          )}

          {activeView === 'px_providers' && (
            <CatalogTableView
              type="px_provider"
              theme="light"
              title="Catálogo de Proveedores PX"
              subtitle="Gestione los proveedores para el módulo PX"
              addLabel="Agregar Proveedor"
              icon={<ClipboardList className="w-6 h-6 text-indigo-500" />}
              iconWrapClassName="bg-indigo-50 p-3 rounded-2xl shadow-lg shadow-indigo-500/10"
              data={pxProviders}
              loading={loading}
              emptyIcon={<ClipboardList size={64} className="mx-auto mb-4" />}
              emptyText="No hay proveedores registrados"
              columns={[
                { header: 'ID', cell: (p) => <span className="font-mono text-[10px] text-slate-400">#{p.id.substring(0,8)}</span> },
                { header: 'Nombre de Proveedor', cell: (p) => <span className="font-black text-[#181c3a] uppercase text-sm tracking-tight">{p.nombre}</span> },
              ]}
              onOpenModal={handleOpenModal}
              onDelete={handleDelete}
            />
          )}

          {activeView === 'piezas' && <PiezasCatalogView />}

          {activeView === 'razones_devolucion' && (
            <CatalogTableView
              type="razon_devolucion"
              theme="light"
              title="Razones de Devolución"
              subtitle="Motivos disponibles al enviar un equipo a devolución"
              addLabel="Agregar Razón"
              icon={<AlertTriangle className="w-6 h-6 text-rose-500" />}
              iconWrapClassName="bg-rose-50 p-3 rounded-2xl shadow-lg shadow-rose-500/10"
              data={razonesDevolucion}
              loading={loading}
              emptyIcon={<AlertTriangle size={64} className="mx-auto mb-4" />}
              emptyText="No hay razones registradas"
              columns={[
                { header: 'ID', cell: (p) => <span className="font-mono text-[10px] text-slate-400">#{p.id.substring(0,8)}</span> },
                { header: 'Razón', cell: (p) => <span className="font-black text-[#181c3a] uppercase text-sm tracking-tight">{p.nombre}</span> },
              ]}
              onOpenModal={handleOpenModal}
              onDelete={handleDelete}
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
              setCurrentPage={setCurrentPage}
              onToggleAll={handleToggleAllAgencies}
              onToggleOne={toggleAgencySelection}
              onBulkDelete={handleBulkDeleteAgencies}
              onBulkImport={handleBulkImport}
              onBulkExport={handleBulkExport}
              onOpenModal={handleOpenModal}
              onDelete={handleDelete}
            />
          )}

          {activeView === 'tecnologias' && (
            <div className="animate-rise-in space-y-6">
               <div className="flex justify-between items-center bg-[#181c3a] p-8 rounded-3xl shadow-xl">
                <div className="flex items-center gap-4 text-white">
                  <div className="bg-[#2ec4f1]/20 p-3 rounded-2xl border border-[#2ec4f1]/30">
                    <Cpu className="w-6 h-6 text-[#2ec4f1]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">Reglas por Tecnología</h3>
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Validación de Series y Longitud</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => handleOpenModal('tecnologia')} className="bg-[#2ec4f1] text-[#181c3a] shadow-lg shadow-[#2ec4f1]/20" leftIcon={<Plus className="w-4 h-4" />}>Nueva Regla</Button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                {loading ? (
                  <div className="py-20 text-center">
                    <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
                    <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
                  </div>
                ) : tecnologias.length === 0 ? (
                  <div className="py-20 text-center opacity-20">
                    <Cpu size={64} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No hay reglas registradas</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Tecnología</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Cant. Series</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Dígitos</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {tecnologias.map(tech => (
                        <tr key={tech.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-[#181c3a] border border-slate-100">
                                <Layers size={14} />
                              </div>
                              <span className="font-black text-[#181c3a] uppercase text-sm tracking-tight">{tech.nombre}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <Badge className="bg-blue-50 text-[#2ec4f1] border-none font-black text-[10px]">{tech.seriesCount} CAMPOS</Badge>
                          </td>
                          <td className="px-8 py-5">
                            <span className="text-[11px] font-mono font-black text-slate-400">{tech.digitsPerSeries?.join(' / ') || 'N/A'}</span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleOpenModal('tecnologia', tech)} className="p-2 text-slate-300 hover:text-[#181c3a]"><Edit3 size={16} /></button>
                              <button onClick={() => handleDelete('tecnologia', tech.id)} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}


          {activeView === 'modelos' && (
            <div className="animate-rise-in space-y-6">
              <div className="bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-50 p-3 rounded-2xl">
                      <Layers className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[#181c3a]">Gestión de Modelos</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vincule marcas con sus respectivos equipos</p>
                    </div>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => handleOpenModal('modelo')} leftIcon={<Plus className="w-4 h-4" />}>Agregar Modelo</Button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  {loading ? (
                    <div className="py-20 text-center">
                      <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
                      <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
                    </div>
                  ) : modelos.length === 0 ? (
                    <div className="py-20 text-center opacity-20">
                      <Layers size={64} className="mx-auto mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No hay modelos registrados</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Marca</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre del Modelo</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Reglas (S/D)</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {modelos.map(mod => {
                          const marca = marcas.find(m => m.id === mod.marcaId);
                          const tech = tecnologias.find(t => t.id === mod.tecnologiaId);
                          return (
                            <tr key={mod.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <Badge className="border-neutral-200 bg-neutral-100 text-black !text-black">
                                  {marca?.nombre}
                                </Badge>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-black">{mod.nombre}</span>
                                  <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-700">
                                    {tech?.nombre}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex gap-2">
                                  <Badge variant="blue" className="border-none bg-[#2ec4f1]/10 text-[9px] text-[#0e7490]">
                                    {mod.seriesCount} Series
                                  </Badge>
                                  <Badge className="border-neutral-200 bg-neutral-100 text-[9px] text-black !text-black">
                                    {mod.digitsPerSeries?.join('/')} Dig.
                                  </Badge>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => handleOpenModal('modelo', mod)} className="p-2 text-neutral-600 hover:text-black"><Edit3 size={14} /></button>
                                  <button onClick={() => handleDelete('modelo', mod.id)} className="p-2 text-neutral-600 hover:text-rose-500"><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'diagnosticos' && (
            <div className="animate-rise-in space-y-6">
              <div className="flex justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-amber-50 p-3 rounded-2xl">
                    <Activity className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#181c3a]">Catálogo de Fallas</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestione diagnósticos y soluciones asociadas</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => handleOpenModal('diagnostico')} leftIcon={<Plus className="w-4 h-4" />}>Nueva Falla</Button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Falla / Diagnóstico</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Reparaciones Sugeridas</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {diagnosticos.map(diag => (
                      <tr key={diag.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-8 py-5">
                          <span className="block text-sm font-black uppercase text-black">{diag.nombre}</span>
                          <span className="mt-1 font-mono text-[9px] text-neutral-700">#{diag.id.substring(0, 8)}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex flex-wrap gap-1">
                            {diag.reparacionesIds.length > 0 ? (
                              diag.reparacionesIds.map(rid => {
                                const rep = reparaciones.find(r => r.id === rid);
                                return (
                                  <Badge
                                    key={rid}
                                    className="border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase text-black !text-black"
                                  >
                                    {rep?.nombre || 'Desconocida'}
                                  </Badge>
                                );
                              })
                            ) : (
                              <span className="text-[10px] font-medium italic text-neutral-600">Sin reparaciones</span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleOpenModal('diagnostico', diag)} className="p-2 text-slate-400 hover:text-[#181c3a]"><Edit3 size={16} /></button>
                            <button onClick={() => handleDelete('diagnostico', diag.id)} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === 'reparaciones' && (
            <CatalogTableView
              type="reparacion"
              theme="dark"
              title="Maestro de Reparaciones"
              subtitle="Lista global de acciones técnicas"
              addLabel="Nueva Reparación"
              icon={<Wrench className="w-6 h-6 text-[#2ec4f1]" />}
              iconWrapClassName="bg-[#2ec4f1]/20 p-3 rounded-2xl border border-[#2ec4f1]/30"
              data={reparaciones}
              loading={loading}
              emptyIcon={<Wrench size={64} className="mx-auto mb-4" />}
              emptyText="No hay reparaciones registradas"
              columns={[
                { header: 'ID', cell: (r) => <span className="font-mono text-[10px] text-slate-400">#{r.id}</span> },
                { header: 'Descripción Técnica', cell: (r) => <span className="font-black text-[#181c3a] text-sm uppercase">{r.nombre}</span> },
              ]}
              onOpenModal={handleOpenModal}
              onDelete={handleDelete}
            />
          )}

          {activeView === 'reacondicionado' && (
            <div className="animate-rise-in space-y-6">
              <div className="flex justify-between items-center bg-[#181c3a] p-8 rounded-3xl shadow-xl">
                <div className="flex items-center gap-4 text-white">
                  <div className="bg-emerald-500/20 p-3 rounded-2xl border border-emerald-500/30">
                    <CheckSquare className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">Pruebas de Reacondicionado</h3>
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Catálogo de pruebas y vinculaciones</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => handleOpenModal('reacondicionado')} className="bg-emerald-500 hover:bg-emerald-600 text-white" leftIcon={<Plus className="w-4 h-4" />}>Nueva Prueba</Button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">ID</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Prueba</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Vinculación (Tec / Modelo)</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reacondicionadoTests.map(rt => {
                      const selectedTechs = tecnologias.filter(t => rt.technologyIds?.includes(t.id));
                      const selectedModels = modelos.filter(m => rt.modelIds?.includes(m.id));
                      return (
                        <tr key={rt.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-5 font-mono text-[10px] text-slate-400">#{rt.id.substring(0,8)}</td>
                          <td className="px-8 py-5 font-black text-[#181c3a] text-sm uppercase">{rt.nombre}</td>
                          <td className="px-8 py-5">
                            <div className="flex flex-wrap gap-2">
                              {selectedTechs.length > 0 ? (
                                selectedTechs.map(tech => <Badge key={tech.id} variant="slate" className="bg-slate-100 text-slate-600 border-none text-[9px] font-bold px-2 py-0.5 uppercase">{tech.nombre}</Badge>)
                              ) : (
                                <Badge variant="slate" className="bg-slate-50 text-slate-400 border-none text-[9px] font-bold px-2 py-0.5 uppercase">TODAS LAS TECNOLOGÍAS</Badge>
                              )}
                              {selectedModels.length > 0 ? (
                                selectedModels.map(mod => <Badge key={mod.id} variant="slate" className="bg-slate-100 text-slate-600 border-none text-[9px] font-bold px-2 py-0.5 uppercase">{mod.nombre}</Badge>)
                              ) : (
                                <Badge variant="slate" className="bg-slate-50 text-slate-400 border-none text-[9px] font-bold px-2 py-0.5 uppercase">TODOS LOS MODELOS</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleOpenModal('reacondicionado', rt)} className="p-3 bg-slate-50 text-slate-400 hover:text-[#181c3a] hover:bg-slate-100 rounded-xl transition-all"><Edit3 size={16} /></button>
                              <button onClick={() => handleDelete('reacondicionado', rt.id)} className="p-3 bg-rose-50 text-rose-300 hover:text-rose-500 hover:bg-rose-100 rounded-xl transition-all"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === 'transportes' && (
            <CatalogTableView
              type="transporte"
              theme="dark"
              title="Transporte Logístico"
              subtitle="Catálogo de empresas de transporte"
              addLabel="Nuevo Transporte"
              icon={<Truck className="w-6 h-6 text-[#2ec4f1]" />}
              iconWrapClassName="bg-[#2ec4f1]/20 p-3 rounded-2xl border border-[#2ec4f1]/30"
              data={transportes}
              idField="dbId"
              loading={loading}
              emptyIcon={<Truck size={64} className="mx-auto mb-4" />}
              emptyText="No hay empresas de transporte configuradas"
              columns={[
                { header: 'Código', cell: (t) => <span className="font-mono text-[10px] text-slate-400">{t.id}</span> },
                { header: 'Nombre de la Empresa', cell: (t) => <span className="font-black text-[#181c3a] text-sm uppercase">{t.nombre}</span> },
              ]}
              onOpenModal={handleOpenModal}
              onDelete={handleDelete}
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
