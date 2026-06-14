"use client";

import React, { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
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
  FileUp,
  FileDown,
  Square,
  CheckSquare,
  Users
} from 'lucide-react';
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
  getPxProviders, savePxProvider, deletePxProvider
} from '@/lib/database/config';
import { adminChangeUserPassword } from '@/app/actions/admin';

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
  const [activeView, setActiveView] = useState<'marcas' | 'modelos' | 'tecnologias' | 'diagnosticos' | 'reparaciones' | 'reacondicionado' | 'agencias' | 'transportes' | 'usuarios' | 'px_providers'>('marcas');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'marca' | 'modelo' | 'tecnologia' | 'diagnostico' | 'reparacion' | 'reacondicionado' | 'agencia' | 'transporte' | 'usuario' | 'px_provider'>('marca');
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
  const [loading, setLoading] = useState(true);
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [t, b, m, a, c, d, r, u, rt, px] = await Promise.all([
        getTechnologies(),
        getBrands(),
        getModels(),
        getAgencies(),
        getCarriers(),
        getDiagnostics(),
        getRepairs(),
        getProfiles(),
        getReacondicionadoTests(),
        getPxProviders()
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
          alert("Error al guardar marca: " + (errMsg || "Conflicto de código o nombre"));
        }
      } else if (modalType === 'modelo') {
        const { error } = await saveModel({ ...editingItem, ...formData });
        if (!error) {
          const m = await getModels();
          setModelos(m.map((x: any) => ({ ...x, nombre: x.name, marcaId: x.brand_id, tecnologiaId: x.technology_id, seriesCount: x.series_count, digitsPerSeries: x.digits_per_series })));
        } else {
          const errMsg = typeof error === 'string' ? error : (error as any)?.message;
          alert("Error al guardar modelo: " + (errMsg || "Conflicto de código o nombre"));
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
          alert("Error al guardar tecnología: " + (errMsg || "Conflicto de código o nombre"));
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
          alert("Error al guardar agencia: " + (typeof error === 'string' ? error : errAny?.message || JSON.stringify(error)));
        }
      } else if (modalType === 'transporte') {
        const { error } = await saveCarrier({ ...editingItem, ...formData });
        if (!error) {
          const c = await getCarriers();
          setTransportes(c.map((x: any) => ({ dbId: x.id, id: x.code, nombre: x.name })));
        } else {
          const errAny = error as any;
          alert("Error al guardar transporte: " + (typeof error === 'string' ? error : errAny?.message || JSON.stringify(error)));
        }
      } else if (modalType === 'px_provider') {
        const { error } = await savePxProvider({ ...editingItem, ...formData });
        if (!error) {
          const px = await getPxProviders();
          setPxProviders(px.map((x: any) => ({ ...x, nombre: x.name })));
        } else {
          alert("Error al guardar proveedor PX: " + (typeof error === 'string' ? error : (error as any)?.message || JSON.stringify(error)));
        }
      } else if (modalType === 'reparacion' || modalType === 'diagnostico') {
        if (modalType === 'reparacion') {
          const { data, error } = await saveRepair({ ...editingItem, ...formData });
          if (!error) {
            const r = await getRepairs();
            setReparaciones(r.map((x: any) => ({ id: x.id, nombre: x.name })));
          } else {
            alert("Error al guardar reparación: " + (error as any)?.message);
          }
        } else {
          const { error } = await saveDiagnosticConfig({ ...editingItem, ...formData });
          if (!error) {
            const d = await getDiagnostics();
            setDiagnosticos(d);
          } else {
            alert("Error al guardar diagnóstico: " + (error as any)?.message);
          }
        }
      } else if (modalType === 'reacondicionado') {
        const { error } = await saveReacondicionadoTest({ ...editingItem, ...formData });
        if (!error) {
          const rt = await getReacondicionadoTests();
          setReacondicionadoTests(rt.map((x: any) => ({ id: x.id, nombre: x.name, technologyIds: x.technology_ids || [], modelIds: x.model_ids || [] })));
        } else {
          alert("Error al guardar prueba de reacondicionado: " + (error as any)?.message);
        }
      } else if (modalType === 'usuario') {
        if (formData.password && formData.password !== formData.confirm_password) {
          alert("Las contraseñas no coinciden.");
          setLoading(false);
          return;
        }

        const { error } = await saveProfile({ ...editingItem, full_name: formData.full_name, email: formData.email });
        if (!error) {
          if (formData.password && editingItem?.id) {
            const pwdResult = await adminChangeUserPassword(editingItem.id, formData.password);
            if (pwdResult.error) {
              alert("Se guardó el usuario, pero hubo un error al cambiar la contraseña: " + pwdResult.error);
            } else {
              alert("Usuario actualizado y contraseña cambiada correctamente.");
            }
          }

          const u = await getProfiles();
          setUsuarios(u);
        } else {
          alert("Error al guardar usuario: " + ((error as any)?.message || JSON.stringify(error)));
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    setShowModal(false);
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm("¿Está seguro de eliminar este registro?")) return;
    setLoading(true);
    try {
      if (type === 'marca') {
        await deleteBrand(id);
        setMarcas(marcas.filter(m => m.id !== id));
      } else if (type === 'modelo') {
        await deleteModel(id);
        setModelos(modelos.filter(m => m.id !== id));
      } else if (type === 'tecnologia') {
        await deleteTechnology(id);
        setTecnologias(tecnologias.filter(t => t.id !== id));
      } else if (type === 'agencia') {
        const { error } = await deleteAgency(id);
        if (error) {
          alert("Error al eliminar agencia: " + ((error as any)?.message || JSON.stringify(error)));
        } else {
          setAgencias(agencias.filter(a => a.dbId !== id));
        }
      } else if (type === 'transporte') {
        const { error } = await deleteCarrier(id);
        if (error) {
          alert("Error al eliminar transporte: " + ((error as any)?.message || JSON.stringify(error)));
        } else {
          setTransportes(transportes.filter(t => t.dbId !== id));
        }
      } else if (type === 'px_provider') {
        await deletePxProvider(id);
        setPxProviders(pxProviders.filter(p => p.id !== id));
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
    if (!confirm(`¿Está seguro de eliminar ${selectedAgencyIds.size} agencias seleccionadas?`)) return;
    
    setLoading(true);
    const idsToDelete = Array.from(selectedAgencyIds);
    const { error } = await deleteAgenciesBulk(idsToDelete);
    
    if (error) {
      alert("Error al eliminar agencias en bloque: " + ((error as any)?.message || JSON.stringify(error)));
    } else {
      setAgencias(agencias.filter(a => !selectedAgencyIds.has(a.dbId)));
      setSelectedAgencyIds(new Set());
      alert(`Éxito: Se han eliminado ${idsToDelete.length} agencias.`);
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
          alert(`Éxito: Se han importado ${newAgencias.length} agencias correctamente.`);
        } else {
          alert("Error al guardar: " + ((error as any)?.message || JSON.stringify(error)));
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
          <button 
            onClick={() => setActiveView('marcas')}
            className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'marcas' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            <Tag size={14} /> Marcas
          </button>
          <button 
            onClick={() => setActiveView('modelos')}
            className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'modelos' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            <Layers size={14} /> Modelos
          </button>
          <button 
            onClick={() => setActiveView('tecnologias')}
            className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'tecnologias' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            <Cpu size={14} /> Tecnologías / Reglas
          </button>
          
          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="px-6 text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Soporte Técnico</p>
            <button 
              onClick={() => setActiveView('diagnosticos')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'diagnosticos' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <Stethoscope size={14} /> Falla Diagnóstico
            </button>
            <button 
              onClick={() => setActiveView('reparaciones')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'reparaciones' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <Wrench size={14} /> Reparaciones
            </button>
            <button 
              onClick={() => setActiveView('reacondicionado')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'reacondicionado' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <CheckSquare size={14} /> Reacondicionado
            </button>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="px-6 text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Logística</p>
            <button 
              onClick={() => setActiveView('agencias')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'agencias' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <Truck size={14} /> Agencias CAC
            </button>
            <button 
              onClick={() => setActiveView('transportes')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'transportes' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <Truck size={14} /> Empresas Logísticas
            </button>
            <button 
              onClick={() => setActiveView('px_providers')}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeView === 'px_providers' ? 'bg-[#181c3a] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <ClipboardList size={14} /> Proveedores PX
            </button>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="px-6 text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Rendimiento</p>
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
          {activeView === 'marcas' && (
            <div className="animate-rise-in space-y-6">
              <div className="flex justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-50 p-3 rounded-2xl shadow-lg shadow-blue-500/10">
                    <Tag className="w-6 h-6 text-[#2ec4f1]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#181c3a]">Catálogo de Marcas</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestione los fabricantes autorizados en el sistema</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => handleOpenModal('marca')} className="bg-[#181c3a] text-white shadow-xl shadow-[#181c3a]/20" leftIcon={<Plus className="w-4 h-4" />}>Agregar Marca</Button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                {loading ? (
                  <div className="py-20 text-center">
                    <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
                    <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
                  </div>
                ) : marcas.length === 0 ? (
                  <div className="py-20 text-center opacity-20">
                    <Tag size={64} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No hay marcas registradas</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">ID</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de Fabricante</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Modelos Vinculados</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {marcas.map(marca => {
                        const count = modelos.filter(m => m.marcaId === marca.id).length;
                        return (
                          <tr key={marca.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-5 font-mono text-[10px] text-slate-400">#{marca.id.substring(0,8)}</td>
                            <td className="px-8 py-5">
                              <span className="font-black text-[#181c3a] uppercase text-sm tracking-tight">{marca.nombre}</span>
                            </td>
                            <td className="px-8 py-5">
                              <Badge className="bg-blue-50 text-[#2ec4f1] border-none font-black text-[10px]">{count} MODELOS</Badge>
                            </td>
                            <td className="px-8 py-5 text-right">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => handleOpenModal('marca', marca)} className="p-2 text-slate-300 hover:text-[#181c3a]"><Edit3 size={16} /></button>
                                <button onClick={() => handleDelete('marca', marca.id)} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
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
          )}

          {activeView === 'px_providers' && (
            <div className="animate-rise-in space-y-6">
              <div className="flex justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-50 p-3 rounded-2xl shadow-lg shadow-indigo-500/10">
                    <ClipboardList className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#181c3a]">Catálogo de Proveedores PX</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestione los proveedores para el módulo PX</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => handleOpenModal('px_provider')} className="bg-[#181c3a] text-white shadow-xl shadow-[#181c3a]/20" leftIcon={<Plus className="w-4 h-4" />}>Agregar Proveedor</Button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                {loading ? (
                  <div className="py-20 text-center">
                    <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
                    <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
                  </div>
                ) : pxProviders.length === 0 ? (
                  <div className="py-20 text-center opacity-20">
                    <ClipboardList size={64} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No hay proveedores registrados</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">ID</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de Proveedor</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pxProviders.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-5 font-mono text-[10px] text-slate-400">#{p.id.substring(0,8)}</td>
                          <td className="px-8 py-5">
                            <span className="font-black text-[#181c3a] uppercase text-sm tracking-tight">{p.nombre}</span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleOpenModal('px_provider', p)} className="p-2 text-slate-300 hover:text-[#181c3a]"><Edit3 size={16} /></button>
                              <button onClick={() => handleDelete('px_provider', p.id)} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
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


          {activeView === 'agencias' && (
            <div className="animate-rise-in space-y-6">
              <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm gap-6">
                <div className="flex items-center gap-4">
                  <div className="bg-[#181c3a] p-3 rounded-2xl shadow-lg shadow-[#181c3a]/10">
                    <Truck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#181c3a]">Directorio de Agencias CAC</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestione los puntos de recepción y sus contactos</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {selectedAgencyIds.size > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleBulkDeleteAgencies}
                      className="bg-rose-50 text-rose-500 border-rose-100 font-black text-[9px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all animate-in fade-in zoom-in"
                      leftIcon={<Trash2 className="w-4 h-4" />}
                    >
                      Eliminar {selectedAgencyIds.size} Seleccionados
                    </Button>
                  )}
                  <input type="file" id="bulk-import" className="hidden" accept=".csv, .xlsx" onChange={handleBulkImport} />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => document.getElementById('bulk-import')?.click()}
                    className="border-2 border-slate-100 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:bg-slate-50"
                    leftIcon={<FileUp className="w-4 h-4" />}
                  >
                    Importar Masivo
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleBulkExport}
                    className="border-2 border-slate-100 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:bg-slate-50"
                    leftIcon={<FileDown className="w-4 h-4" />}
                  >
                    Exportar Excel
                  </Button>
                  <div className="w-[1px] h-8 bg-slate-100 mx-2 hidden md:block" />
                  <Button variant="primary" size="sm" onClick={() => handleOpenModal('agencia')} className="bg-[#181c3a] text-white shadow-xl shadow-[#181c3a]/20" leftIcon={<Plus className="w-4 h-4" />}>Nueva Agencia</Button>
                </div>
              </div>
              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                {loading ? (
                  <div className="py-20 text-center">
                    <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
                    <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
                  </div>
                ) : agencias.length === 0 ? (
                  <div className="py-20 text-center opacity-20">
                    <Truck size={64} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No hay agencias registradas</p>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-6 py-4 w-10">
                            <button 
                              onClick={handleToggleAllAgencies}
                              className="text-slate-300 hover:text-[#2ec4f1] transition-colors"
                            >
                              {selectedAgencyIds.size === agencias.length && agencias.length > 0 ? <CheckSquare size={16} className="text-[#2ec4f1]" /> : <Square size={16} />}
                            </button>
                          </th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">ID</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Encargado</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Email</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Teléfono</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Dirección</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {paginatedAgencias.map(ag => (
                          <tr key={ag.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => toggleAgencySelection(ag.dbId)}
                                className="text-slate-300 hover:text-[#2ec4f1] transition-colors"
                              >
                                {selectedAgencyIds.has(ag.dbId) ? <CheckSquare size={16} className="text-[#2ec4f1]" /> : <Square size={16} />}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <Badge className="bg-[#181c3a] text-[#2ec4f1] border-none font-black text-[9px] px-2 py-0.5 whitespace-nowrap">{ag.id}</Badge>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-black text-[#181c3a] uppercase text-[10px] tracking-tight">{ag.nombre}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest leading-tight block max-w-[150px]">{ag.encargado}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-bold text-slate-400">{ag.email}</span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[10px] font-black text-[#181c3a] whitespace-pre-line leading-relaxed">{ag.telefono}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[9px] font-medium text-slate-400 whitespace-pre-line leading-tight max-w-[200px]">{ag.direccion}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleOpenModal('agencia', ag)} className="p-2 text-slate-300 hover:text-[#181c3a] transition-colors"><Edit3 size={14} /></button>
                                <button onClick={() => handleDelete('agencia', ag.dbId)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Controles de Paginación */}
                    <div className="bg-slate-50/50 p-6 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-100">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Mostrando <span className="text-[#181c3a]">{paginatedAgencias.length}</span> de <span className="text-[#181c3a]">{agencias.length}</span> Agencias
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-10 h-10 rounded-xl font-black text-xs transition-all ${
                              currentPage === page 
                                ? 'bg-[#181c3a] text-white shadow-lg' 
                                : 'bg-white text-slate-400 hover:bg-slate-100 border border-slate-100'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
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
                                <Badge variant="slate" className="bg-slate-100 text-[#181c3a] border-none font-black text-[10px]">{marca?.nombre}</Badge>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-slate-700">{mod.nombre}</span>
                                  <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{tech?.nombre}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex gap-2">
                                  <Badge variant="blue" className="text-[9px] bg-[#2ec4f1]/10 text-[#2ec4f1] border-none">{mod.seriesCount} Series</Badge>
                                  <Badge variant="slate" className="text-[9px] bg-slate-100 text-slate-500 border-none">{mod.digitsPerSeries?.join('/')} Dig.</Badge>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => handleOpenModal('modelo', mod)} className="p-2 text-slate-300 hover:text-[#181c3a]"><Edit3 size={14} /></button>
                                  <button onClick={() => handleDelete('modelo', mod.id)} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
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
                          <span className="font-black text-[#181c3a] text-sm uppercase block">{diag.nombre}</span>
                          <span className="font-mono text-[9px] text-slate-400 mt-1">#{diag.id.substring(0, 8)}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex flex-wrap gap-1">
                            {diag.reparacionesIds.length > 0 ? (
                              diag.reparacionesIds.map(rid => {
                                const rep = reparaciones.find(r => r.id === rid);
                                return <Badge key={rid} variant="slate" className="bg-slate-100 text-slate-600 border-none text-[9px] font-bold px-2 py-0.5 uppercase">{rep?.nombre || 'Desconocida'}</Badge>
                              })
                            ) : (
                              <span className="text-[10px] italic text-slate-300 font-medium">Sin reparaciones</span>
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
            <div className="animate-rise-in space-y-6">
              <div className="flex justify-between items-center bg-[#181c3a] p-8 rounded-3xl shadow-xl">
                <div className="flex items-center gap-4 text-white">
                  <div className="bg-[#2ec4f1]/20 p-3 rounded-2xl border border-[#2ec4f1]/30">
                    <Wrench className="w-6 h-6 text-[#2ec4f1]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">Maestro de Reparaciones</h3>
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Lista global de acciones técnicas</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => handleOpenModal('reparacion')} className="bg-[#2ec4f1] text-[#181c3a]" leftIcon={<Plus className="w-4 h-4" />}>Nueva Reparación</Button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">ID</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción Técnica</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reparaciones.map(rep => (
                      <tr key={rep.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-5 font-mono text-[10px] text-slate-400">#{rep.id}</td>
                        <td className="px-8 py-5 font-black text-[#181c3a] text-sm uppercase">{rep.nombre}</td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleOpenModal('reparacion', rep)} className="p-3 bg-slate-50 text-slate-400 hover:text-[#181c3a] hover:bg-slate-100 rounded-xl transition-all"><Edit3 size={16} /></button>
                            <button onClick={() => handleDelete('reparacion', rep.id)} className="p-3 bg-rose-50 text-rose-300 hover:text-rose-500 hover:bg-rose-100 rounded-xl transition-all"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
            <div className="animate-rise-in space-y-6">
              <div className="flex justify-between items-center bg-[#181c3a] p-8 rounded-3xl shadow-xl">
                <div className="flex items-center gap-4 text-white">
                  <div className="bg-[#2ec4f1]/20 p-3 rounded-2xl border border-[#2ec4f1]/30">
                    <Truck className="w-6 h-6 text-[#2ec4f1]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">Transporte Logístico</h3>
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Catálogo de empresas de transporte</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => handleOpenModal('transporte')} className="bg-[#2ec4f1] text-[#181c3a]" leftIcon={<Plus className="w-4 h-4" />}>Nuevo Transporte</Button>
              </div>

              <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Código</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de la Empresa</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transportes.map(trans => (
                      <tr key={trans.dbId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-5 font-mono text-[10px] text-slate-400">{trans.id}</td>
                        <td className="px-8 py-5 font-black text-[#181c3a] text-sm uppercase">{trans.nombre}</td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleOpenModal('transporte', trans)} className="p-3 bg-slate-50 text-slate-400 hover:text-[#181c3a] hover:bg-slate-100 rounded-xl transition-all"><Edit3 size={16} /></button>
                            <button onClick={() => handleDelete('transporte', trans.dbId)} className="p-3 bg-rose-50 text-rose-300 hover:text-rose-500 hover:bg-rose-100 rounded-xl transition-all"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {transportes.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-8 py-8 text-center text-slate-400 text-xs italic">
                          No hay empresas de transporte configuradas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}


        </div>
      </div>

      {/* Modal Genérico de Configuración */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/60 backdrop-blur-md p-6 overflow-y-auto">
          <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden border-none my-8">
            <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
              <h3 className="text-lg font-bold uppercase tracking-tight">
                {editingItem ? 'Editar' : 'Agregar'} {modalType.toUpperCase()}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSave} className="p-8 space-y-6 bg-white">
              {modalType === 'agencia' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">ID Agencia / Tienda</label>
                      <input 
                        type="text" required
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                        value={formData.id || ''}
                        onChange={e => setFormData({...formData, id: e.target.value.toUpperCase()})}
                        placeholder="Ej. G213"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Tienda</label>
                      <input 
                        type="text" required
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                        value={formData.nombre || ''}
                        onChange={e => setFormData({...formData, nombre: e.target.value})}
                        placeholder="Ej. Atanasio Tzul"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Encargado de Tienda</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                      value={formData.encargado || ''}
                      onChange={e => setFormData({...formData, encargado: e.target.value})}
                      placeholder="Nombre Completo"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Email Notificaciones</label>
                      <input 
                        type="email" required
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                        value={formData.email || ''}
                        onChange={e => setFormData({...formData, email: e.target.value.toLowerCase()})}
                        placeholder="ejemplo@claro.com.gt"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Teléfono(s)</label>
                      <textarea 
                        required
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1] min-h-[80px]"
                        value={formData.telefono || ''}
                        onChange={e => setFormData({...formData, telefono: e.target.value})}
                        placeholder="Ingrese uno o más números (uno por línea)"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Dirección Física de la Tienda</label>
                    <textarea 
                      required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1] min-h-[100px]"
                      value={formData.direccion || ''}
                      onChange={e => setFormData({...formData, direccion: e.target.value})}
                      placeholder="Ej. Diagonal 1 51-57 zona 12 locales 89 y 90 C.C. Atanasio Tzul"
                    />
                  </div>
                </div>
              )}

              {modalType === 'marca' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Marca</label>
                  <input 
                    type="text" required
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                    value={formData.nombre || ''}
                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                    placeholder="Ej. Samsung"
                  />
                </div>
              )}

              {modalType === 'transporte' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Código</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1] uppercase"
                      value={formData.id || ''}
                      onChange={e => setFormData({...formData, id: e.target.value})}
                      placeholder="Dejar en blanco para auto-generar"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Empresa</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                      value={formData.nombre || ''}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      placeholder="Ej. Cargo Express"
                    />
                  </div>
                </div>
              )}

              {modalType === 'modelo' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Marca</label>
                      <select 
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                        value={formData.marcaId || ''}
                        onChange={e => setFormData({...formData, marcaId: e.target.value})}
                        required
                      >
                        <option value="">Seleccionar...</option>
                        {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Tecnología Base</label>
                      <select 
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                        value={formData.tecnologiaId || ''}
                        onChange={e => {
                          const tech = tecnologias.find(t => t.id === e.target.value);
                          setFormData({
                            ...formData, 
                            tecnologiaId: e.target.value,
                            seriesCount: tech?.seriesCount || formData.seriesCount,
                            digitsPerSeries: tech?.digitsPerSeries || formData.digitsPerSeries || [12]
                          });
                        }}
                        required
                      >
                        <option value="">Seleccionar...</option>
                        {tecnologias.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Nombre del Modelo</label>
                      <input 
                        type="text" required
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                        value={formData.nombre || ''}
                        onChange={e => setFormData({...formData, nombre: e.target.value})}
                      />
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-4">
                       <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-[#2ec4f1]">Cantidad de Campos de Serie</label>
                        <input 
                          type="number" required min="1" max="4"
                          className="w-full bg-blue-50/50 p-4 rounded-xl border border-[#2ec4f1]/20 font-bold text-[#181c3a]"
                          value={formData.seriesCount || ''}
                          onChange={e => updateSeriesCount(parseInt(e.target.value))}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 animate-rise-in">
                        {Array.from({ length: formData.seriesCount || 0 }).map((_, i) => (
                          <div key={i} className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-amber-500">Dígitos Serie {i + 1}</label>
                            <input 
                              type="number" required min="1"
                              className="w-full bg-amber-50/50 p-4 rounded-xl border border-amber-200 font-bold text-[#181c3a]"
                              value={formData.digitsPerSeries?.[i] || 12}
                              onChange={e => {
                                const newDigits = [...(formData.digitsPerSeries || [])];
                                newDigits[i] = parseInt(e.target.value);
                                setFormData({ ...formData, digitsPerSeries: newDigits });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Modelos Existentes</p>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {formData.marcaId ? (
                        modelsInSelectedBrand.length > 0 ? (
                          modelsInSelectedBrand.map(m => (
                            <div key={m.id} className="flex flex-col bg-white p-4 rounded-xl border border-slate-200 gap-2">
                              <span className="text-xs font-bold text-slate-600">{m.nombre}</span>
                              <div className="flex flex-wrap gap-1">
                                {m.digitsPerSeries?.map((d, idx) => (
                                  <Badge key={idx} className="text-[7px] bg-slate-50 text-slate-400 border-none">S{idx+1}: {d}D</Badge>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-slate-400">
                            <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-[10px] font-bold uppercase">Sin modelos</p>
                          </div>
                        )
                      ) : (
                        <div className="text-center py-8 text-slate-300">
                          <p className="text-[10px] font-bold uppercase">Seleccione una marca</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {modalType === 'reacondicionado' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Prueba</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-emerald-400"
                      value={formData.nombre || ''}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      placeholder="Ej. Limpieza de puerto LAN"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Vincular a Tecnología(s) (Opcional)</label>
                      <select 
                        multiple
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold text-slate-600 outline-none focus:border-emerald-400 min-h-[120px]"
                        value={formData.technologyIds || []}
                        onChange={e => {
                          const options = Array.from(e.target.selectedOptions, option => option.value).filter(v => v !== '');
                          setFormData({...formData, technologyIds: options, modelIds: []}); // Reset model when technology changes
                        }} 
                      >
                        <option value="">TODAS LAS TECNOLOGÍAS</option>
                        {tecnologias.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Vincular a Modelo(s) (Opcional)</label>
                      <select 
                        multiple
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold text-slate-600 outline-none focus:border-emerald-400 min-h-[120px]"
                        value={formData.modelIds || []}
                        onChange={e => {
                          const options = Array.from(e.target.selectedOptions, option => option.value).filter(v => v !== '');
                          setFormData({...formData, modelIds: options});
                        }}
                      >
                        <option value="">TODOS LOS MODELOS</option>
                        {modelos
                          .filter(m => !(formData.technologyIds?.length > 0) || formData.technologyIds.includes(m.tecnologiaId))
                          .map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                      <p className="text-[9px] text-slate-400 font-medium px-2">Ctrl+Click para seleccionar múltiples. Si deja en blanco, aplicará a todo el equipo.</p>
                    </div>
                  </div>
                </div>
              )}

              {modalType === 'tecnologia' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nombre Tecnología</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                      value={formData.nombre || ''}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Cant. Series (Default)</label>
                      <input 
                        type="number" required
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                        value={formData.seriesCount || ''}
                        onChange={e => updateSeriesCount(parseInt(e.target.value))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {Array.from({ length: formData.seriesCount || 0 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <label className="text-[9px] font-black uppercase text-slate-400">Dígitos Serie {i + 1}</label>
                          <input 
                            type="number" required
                            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                            value={formData.digitsPerSeries?.[i] || 12}
                            onChange={e => {
                              const newDigits = [...(formData.digitsPerSeries || [])];
                              newDigits[i] = parseInt(e.target.value);
                              setFormData({ ...formData, digitsPerSeries: newDigits });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalType === 'diagnostico' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Falla / Diagnóstico</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-amber-400"
                      value={formData.nombre || ''}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      placeholder="Ej. Sin Señal WIFI"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400">Vincular Reparaciones Sugeridas</label>
                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto p-2 border-2 border-slate-50 rounded-2xl custom-scrollbar">
                      {reparaciones.map(rep => {
                        const isSelected = (formData.reparacionesIds || []).includes(rep.id);
                        return (
                          <button
                            key={rep.id}
                            type="button"
                            onClick={() => {
                              const currentIds = formData.reparacionesIds || [];
                              const newIds = isSelected 
                                ? currentIds.filter((id: string) => id !== rep.id)
                                : [...currentIds, rep.id];
                              setFormData({ ...formData, reparacionesIds: newIds });
                            }}
                            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${isSelected ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-300'}`}>
                              {isSelected && <CheckCircle2 size={12} />}
                            </div>
                            <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-amber-700' : 'text-slate-600'}`}>{rep.nombre}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {modalType === 'px_provider' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nombre de Proveedor PX</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                      value={formData.nombre || ''}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      placeholder="Ej. LGB"
                    />
                  </div>
                </div>
              )}

              {modalType === 'reparacion' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Descripción de la Reparación</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                      value={formData.nombre || ''}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      placeholder="Ej. Cambio de Fuente de Poder"
                    />
                  </div>
                </div>
              )}

              {modalType === 'usuario' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nombre y Apellido</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                      value={formData.full_name || ''}
                      onChange={e => setFormData({...formData, full_name: e.target.value})}
                      placeholder="Ej. Juan Pérez"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Correo</label>
                    <input 
                      type="email" required
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                      value={formData.email || ''}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      placeholder="Ej. usuario@empresa.com"
                    />
                  </div>
                  
                  <div className="pt-4 mt-2 border-t border-slate-100 space-y-4">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Seguridad (Opcional)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Nueva Contraseña</label>
                        <input 
                          type="password"
                          className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                          value={formData.password || ''}
                          onChange={e => setFormData({...formData, password: e.target.value})}
                          placeholder="Dejar en blanco para no cambiar"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Confirmar Contraseña</label>
                        <input 
                          type="password"
                          className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                          value={formData.confirm_password || ''}
                          onChange={e => setFormData({...formData, confirm_password: e.target.value})}
                          placeholder="Repita la nueva contraseña"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
                <Button variant="primary" className="flex-1" type="submit">Guardar Configuración</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </ModulePage>
  );
}
