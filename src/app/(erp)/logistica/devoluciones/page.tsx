"use client";

import React, { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { 
  RotateCcw, 
  UserX, 
  FileWarning, 
  History, 
  Search, 
  ArrowRight,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Package,
  Loader2,
  Trash2
} from 'lucide-react';
import { getReturns, registerNewReturn, processFullReceptionReturn, undoFullReceptionReturn, processBlockReturnBySapTransfer, getSapBlockReturnRows } from '@/lib/database/returns';
import { getReceptions } from '@/lib/database/receptions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getActualUserFullName } from '@/lib/auth';
import { useEffect } from 'react';

type Devolucion = {
  id: string;
  sn: string;
  cliente: string;
  motivo: string;
  fecha: string;
  estatus: 'Pendiente' | 'Procesado' | 'Rechazado';
  tecnico?: string;
  receptionId?: string;
};

const mockDevoluciones: Devolucion[] = [
  { id: 'DEV-9901', sn: 'SN-HUA-1122', cliente: 'Tienda Zona 10', motivo: 'Garantía - No enciende', fecha: '28/04/2026', estatus: 'Pendiente' },
  { id: 'DEV-9902', sn: 'SN-NOK-3344', cliente: 'CAC Quetzaltenango', motivo: 'Cambio de Tecnología', fecha: '28/04/2026', estatus: 'Procesado', tecnico: 'Herbert P.' },
  { id: 'DEV-9905', sn: 'SN-ZTE-5566', cliente: 'Individual - 01', motivo: 'Error de Despacho', fecha: '27/04/2026', estatus: 'Pendiente' },
];

const RETURN_REASONS = [
  'Garantía - No enciende',
  'Garantía - Señal Inestable',
  'Cambio de Tecnología',
  'Error de Despacho',
  'Pedido Duplicado',
  'Equipo Obsoleto',
  'Daño Cosmético / Golpeado'
];

export default function DevolucionesPage() {
  const [activeCategory] = useState<'BODEGA DEVOLUCIÓN'>('BODEGA DEVOLUCIÓN');
  const [selectedDev, setSelectedDev] = useState<Devolucion | null>(null);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showNewReturnModal, setShowNewReturnModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const isSubmittingRef = React.useRef(false);
  const [newReturn, setNewReturn] = useState({
    originalGuide: '',
    sn: '',
    cliente: '',
    motivo: RETURN_REASONS[0],
    guiaSalida: '',
    category: 'BODEGA DEVOLUCIÓN' as any
  });

  const [returnReceptionId, setReturnReceptionId] = useState<string | null>(null);
  const [returnReceptionData, setReturnReceptionData] = useState<any>(null);
  const [returnSeriesData, setReturnSeriesData] = useState<any[]>([]);
  const [fullReturnForm, setFullReturnForm] = useState({ motivo: '', guiaSalida: '', observaciones: '' });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const recId = urlParams.get('reception_id');
      if (recId) {
        setReturnReceptionId(recId);
        loadReceptionForReturn(recId);
      } else {
        fetchReturns();
      }
    }
  }, [activeCategory]);

  const loadReceptionForReturn = async (id: string) => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data: rec } = await supabase.from('receptions').select('*').eq('id', id).single();
      const { data: series } = await supabase.from('series').select(`
        *,
        models(name, technologies(name)),
        brands(name)
      `).eq('current_reception_id', id);
      setReturnReceptionData(rec);
      setReturnSeriesData(series || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessFullReturn = async () => {
    if (!fullReturnForm.motivo || !fullReturnForm.guiaSalida) {
      alert("Motivo y Guía de Salida son obligatorios.");
      return;
    }
    setLoading(true);

    const supabase = getSupabaseBrowserClient();

    const userName = getActualUserFullName();
    const res = await processFullReceptionReturn(returnReceptionId!, fullReturnForm, userName);
    setLoading(false);
    if (res.error) {
      alert("Error: " + res.error);
    } else {
      alert("Devolución procesada. El lote y sus equipos ahora están en la bandeja de Devoluciones pendientes.");
      window.location.href = '/logistica/devoluciones';
    }
  };

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      // Query directa a reception_guides — sin regex, sin parsing de notes
      const { data, error } = await supabase
        .from('reception_guides')
        .select(`
          id,
          guide_number,
          category,
          agency,
          status,
          classified_by,
          classified_at,
          motivo,
          reception_id,
          receptions (
            id,
            created_at,
            carrier,
            status,
            guide_number
          )
        `)
        .eq('category', 'devolucion')
        .not('receptions.status', 'in', '("ARCHIVADO","ELIMINADO","DEVUELTO")')
        .order('classified_at', { ascending: false });

      if (error) {
        console.error('Error fetching devoluciones from reception_guides:', error.message);
        return;
      }

      const devolRows = (data || [])
        .filter((rg: any) => rg.receptions) // excluir huérfanas
        .map((rg: any) => ({
          id: `DEV-${rg.reception_id?.slice(0, 5).toUpperCase()}-${rg.guide_number}`,
          sn: rg.guide_number,
          cliente: rg.agency || rg.receptions?.carrier || 'S/D',
          motivo: rg.motivo || 'Devolución',
          fecha: rg.classified_at
            ? new Date(rg.classified_at).toLocaleDateString()
            : new Date(rg.receptions?.created_at).toLocaleDateString(),
          timestamp: rg.classified_at
            ? new Date(rg.classified_at).getTime()
            : new Date(rg.receptions?.created_at).getTime(),
          estatus: rg.receptions?.status === 'DESPACHADO' ? 'Procesado' : 'Pendiente',
          dbId: rg.id,
          category: 'BODEGA DEVOLUCIÓN',
          os: '---',
          isReception: true,
          receptionId: rg.reception_id,
          classifiedBy: rg.classified_by,
        }));

      const sapBlockRows = await getSapBlockReturnRows();

      const merged = [...devolRows, ...sapBlockRows].sort(
        (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
      );

      setDevoluciones(merged as Devolucion[]);
    } catch (err) {
      console.error("Error in fetchReturns:", err);
    } finally {
      setLoading(false);
    }
  };

  const printConduce = (items: any[]) => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    const today = new Date().toLocaleDateString();
    
    const html = `
      <html>
        <head>
          <title>Conduce de Salida - Devoluciones</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #181c3a; }
            .header { text-align: center; margin-bottom: 40px; }
            .title { font-size: 24px; font-weight: 900; letter-spacing: 1px; margin-bottom: 10px; }
            .meta { font-size: 14px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
            th { background-color: #f8fafc; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
            td { font-size: 14px; font-weight: 500; }
            .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
            .sig-line { width: 200px; border-top: 1px solid #cbd5e1; text-align: center; padding-top: 10px; font-size: 12px; font-weight: bold; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">CONDUCE DE SALIDA - DESPACHO MASIVO</div>
            <div class="meta">Fecha de Emisión: ${today} | Total de Ítems: ${items.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>ID</th>
                <th>Serie (SN)</th>
                <th>Cliente / Origen</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${item.id}</td>
                  <td style="font-family: monospace; font-weight: bold;">${item.sn}</td>
                  <td>${item.cliente}</td>
                  <td>${item.motivo}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="signatures">
            <div class="sig-line">Entregado por (Logística)</div>
            <div class="sig-line">Recibido por (Transporte/Courier)</div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleRegisterReturn = async () => {
    if (!newReturn.sn || !newReturn.originalGuide) return;
    if (loading || isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      // Agregamos la categoría a las notas para el filtrado independiente
      const payload = {
        ...newReturn,
        motivo: `${newReturn.motivo}\nCat: ${newReturn.category}`
      };
      const result = await registerNewReturn(payload);

      if (result.error) {
        const block = result as { error: string; requiresBlockReturn?: boolean; sapTransferId?: string };
        if (block.requiresBlockReturn && block.sapTransferId) {
          const proceed = confirm(
            `${block.error}\n\n¿Desea procesar la devolución en bloque de todo el Documento SAP ahora?`
          );
          if (proceed) {
            const userName = (await supabase?.auth.getUser())?.data?.user?.email || 'SISTEMA';
            const blockRes = await processBlockReturnBySapTransfer(
              block.sapTransferId,
              {
                motivo: newReturn.motivo,
                guiaSalida: newReturn.guiaSalida,
              },
              userName
            );
            if (blockRes.error) {
              alert(blockRes.error);
            } else {
              await fetchReturns();
              setShowNewReturnModal(false);
              setNewReturn({ originalGuide: '', sn: '', cliente: '', motivo: RETURN_REASONS[0], guiaSalida: '', category: activeCategory });
              alert(`Devolución en bloque aplicada a ${blockRes.unitsCount} equipos del mismo Documento SAP.`);
            }
          }
        } else {
          alert(result.error);
        }
      } else {
        await fetchReturns();
        setShowNewReturnModal(false);
        setNewReturn({ originalGuide: '', sn: '', cliente: '', motivo: RETURN_REASONS[0], guiaSalida: '', category: activeCategory });
        alert("Retorno registrado exitosamente.");
      }
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleDespachoMasivo = async () => {
    if (!confirm(`¿Está seguro de despachar masivamente ${selectedIds.length} guías/series?`)) return;
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase not configured");

      const itemsToUpdate = devoluciones.filter(d => selectedIds.includes(d.id));
      
      for (const item of itemsToUpdate) {
        if (item.id.startsWith('REC-')) {
          await supabase.from('receptions').update({ status: 'DESPACHADO' }).eq('id', (item as any).dbId);
        } else {
          await supabase.from('series').update({ current_status: 'DESPACHADO' }).eq('id', (item as any).dbId);
        }
      }
      
      alert("Despacho masivo confirmado con éxito. Se generará el conduce a continuación.");
      printConduce(itemsToUpdate);
      setSelectedIds([]);
      await fetchReturns();
    } catch (err: any) {
      alert("Error en despacho masivo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUndoDevolution = async (dev?: Devolucion) => {
    const targetDev = dev || selectedDev;
    if (!targetDev) return;

    if (targetDev.receptionId) {
      if (!confirm(`Se revertirá la devolución de todos los equipos asociados a la guía del lote. ¿Está seguro de continuar?`)) return;
      setLoading(true);
      try {
        const res = await undoFullReceptionReturn(targetDev.receptionId);
        if (res.error) throw new Error(res.error);
        alert("El lote y todos sus equipos han regresado a Clasificación.");
        await fetchReturns();
        setSelectedDev(null);
      } catch (err: any) {
        alert("Error al intentar revertir: " + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!confirm(`¿Está seguro de regresar la guía ${targetDev.sn} a Clasificación (Backoffice)? Esto eliminará la devolución actual.`)) return;
    
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase not configured");

      const guideNumber = targetDev.sn;
      
      // 1. Encontrar la recepción maestra que contiene esta guía
      const { data: masterRecs } = await supabase
        .from('receptions')
        .select('*')
        .contains('processed_guides', [guideNumber]);

      let masterRec = null;
      if (masterRecs && masterRecs.length > 0) {
        masterRec = masterRecs[0];
      } else {
        // Fallback: buscar directamente por guide_number
        const { data: directRecs } = await supabase
          .from('receptions')
          .select('*')
          .eq('guide_number', guideNumber);
        if (directRecs && directRecs.length > 0) {
           masterRec = directRecs[0];
        }
      }

      // 2. Eliminar la sub-recepción (si existe como id)
      const { data: checkRec } = await supabase.from('receptions').select('id').eq('id', (selectedDev as any).dbId).maybeSingle();
      if (checkRec) {
        await supabase.from('receptions').delete().eq('id', (selectedDev as any).dbId);
      }

      // 3. Actualizar la recepción maestra
      if (masterRec) {
        const newProcessed = (masterRec.processed_guides || []).filter((g: string) => g !== guideNumber);
        
        let notes = masterRec.notes || '';
        const timestamp = new Date().toLocaleString();
        const timelineEvent = `\n[${timestamp}] MOV-UNDO | BACKOFFICE | REVERSA DE DEVOLUCIÓN: Guía ${guideNumber} regresada a Clasificación (Deshacer)`;
        
        if (notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
          notes = notes.replace('--- LÍNEA DE TIEMPO (MATRIZ) ---', `--- LÍNEA DE TIEMPO (MATRIZ) ---${timelineEvent}`);
        } else {
          notes += `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n${timelineEvent}`;
        }

        await supabase.from('receptions').update({
          processed_guides: newProcessed,
          status: 'PENDIENTE_BACKOFFICE',
          notes: notes
        }).eq('id', masterRec.id);
      }

      alert("La guía ha sido regresada a Backoffice exitosamente. Verifique en Consultador la Línea de Tiempo.");
      await fetchReturns();
      setSelectedDev(null);
    } catch (err: any) {
      console.error(err);
      alert("Error al intentar revertir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevolution = async (dev: Devolucion) => {
    if (!confirm(`¿Está seguro de OCULTAR/DESCARTAR el registro ${dev.sn}? El registro se conservará pero ya no aparecerá en esta lista.`)) return;
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase not configured");

      if ((dev as any).isReception) {
         if (!confirm(`Este registro representa un Lote de Devolución de Backoffice. ¿Desea descartar y ocultar todo el Lote completo?`)) {
             setLoading(false);
             return;
         }
         await supabase.from('receptions').update({ status: 'ARCHIVADO' }).eq('id', (dev as any).dbId);
      } else {
         if (dev.receptionId) {
            if (!confirm(`Este equipo pertenece a un lote de devolución procesado. ¿Desea descartar TODO el lote y ocultar todos sus equipos asociados?`)) {
                setLoading(false);
                return;
            }
            await supabase.from('series').update({ current_status: 'archivado' }).eq('current_reception_id', dev.receptionId);
            await supabase.from('receptions').update({ status: 'ARCHIVADO' }).eq('id', dev.receptionId);
         } else {
            await supabase.from('series').update({ current_status: 'archivado' }).eq('id', (dev as any).dbId);
         }
      }

      alert("Registro descartado y ocultado exitosamente.");
      await fetchReturns();
      setSelectedDev(null);
    } catch (e: any) {
      alert("Error al descartar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (returnReceptionId) {
    if (!returnReceptionData) {
      return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-[#2ec4f1] w-10 h-10" /></div>;
    }
    return (
      <ModulePage title="Procesar Devolución de Lote" subtitle="Verificación y retorno de equipos clasificados" category="Logística">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-rise-in">
           <div className="lg:col-span-2 space-y-6">
              <Card>
                <h3 className="text-sm font-black uppercase tracking-widest text-[#181c3a] mb-4">Equipos del Lote ({returnSeriesData.length})</h3>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                     <thead>
                       <tr className="bg-slate-50">
                         <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Serie</th>
                         <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Marca / Modelo</th>
                         <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado Actual</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                       {returnSeriesData.map(s => (
                         <tr key={s.id} className="hover:bg-slate-50">
                           <td className="p-3 text-sm font-bold font-mono">{s.serial_number}</td>
                           <td className="p-3 text-xs font-medium text-slate-600">{s.brands?.name || 'S/D'} - {s.models?.name || 'S/D'}</td>
                           <td className="p-3 text-xs"><Badge className="bg-blue-50 text-blue-600 border-none font-black text-[9px] uppercase tracking-widest">{s.current_status}</Badge></td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                </div>
              </Card>
           </div>
           <div className="space-y-6">
              <Card className="bg-[#181c3a] text-white p-6 border-none">
                <h3 className="text-xs font-black uppercase tracking-widest mb-4 text-[#2ec4f1]">Información de Recepción</h3>
                <div className="space-y-3 text-sm font-medium">
                  <p><span className="text-white/40 block text-[10px] uppercase font-black tracking-widest">Guía:</span> {returnReceptionData.guide_number}</p>
                  <p><span className="text-white/40 block text-[10px] uppercase font-black tracking-widest">Courier:</span> {returnReceptionData.carrier || 'N/A'}</p>
                  <p><span className="text-white/40 block text-[10px] uppercase font-black tracking-widest">Recibió:</span> {returnReceptionData.received_by || 'SISTEMA'}</p>
                  <p><span className="text-white/40 block text-[10px] uppercase font-black tracking-widest">Estado Lote:</span> <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest">{returnReceptionData.status}</span></p>
                </div>
              </Card>
              <Card className="p-6 space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Motivo (Obligatorio)</label>
                  <select value={fullReturnForm.motivo} onChange={e => setFullReturnForm({...fullReturnForm, motivo: e.target.value})} className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all">
                    <option value="">-- Seleccione un motivo --</option>
                    {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Guía Courier Salida (Obligatorio)</label>
                  <input value={fullReturnForm.guiaSalida} onChange={e => setFullReturnForm({...fullReturnForm, guiaSalida: e.target.value})} className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all uppercase" placeholder="Ej. CAR-9001" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Observaciones (Opcional)</label>
                  <textarea value={fullReturnForm.observaciones} onChange={e => setFullReturnForm({...fullReturnForm, observaciones: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium text-sm text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all min-h-[100px]" placeholder="Detalles adicionales..." />
                </div>
                <div className="pt-4 flex flex-col gap-3">
                  <Button variant="primary" className="w-full bg-rose-500 hover:bg-rose-600 text-white shadow-xl shadow-rose-500/20 h-14 font-black uppercase tracking-widest text-xs" disabled={loading} onClick={handleProcessFullReturn}>
                    Confirmar Devolución ({returnSeriesData.length})
                  </Button>
                  <Button variant="outline" className="w-full h-12 font-black uppercase tracking-widest text-[10px]" onClick={() => window.location.href = '/produccion/backoffice'}>Cancelar y Volver</Button>
                </div>
              </Card>
           </div>
        </div>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="Gestión de Devoluciones"
      subtitle="Control de retornos, garantías y reversión de logística. Trazabilidad completa desde el cliente hasta el taller."
      category="Logística"
      actions={
        <div className="flex gap-3">
          <Button variant="outline" leftIcon={<History className="w-4 h-4" />}>Reporte Mensual</Button>
          <Button 
            variant="primary" 
            leftIcon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setShowNewReturnModal(true)}
          >
            Registrar Retorno
          </Button>
        </div>
      }
    >
      {/* TABS NAVEGACIÓN - ELIMINADAS PARA SIMPLIFICACIÓN */}
      <div className="mb-8 border-b border-slate-100">
        <div className="pb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#181c3a] relative inline-block">
          BODEGA DEVOLUCIÓN
          <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#2ec4f1] rounded-t-full" />
        </div>
      </div>
      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* Listado de Devoluciones */}
        <div className="lg:col-span-8 space-y-6">
          <ModuleToolbar 
            onSearch={(v) => console.log(v)}
            addLabel="Nuevo Retorno"
          />

          {selectedIds.length > 0 && (
            <div className="bg-[#181c3a] p-4 rounded-2xl flex items-center justify-between mb-4 shadow-xl">
              <span className="text-white text-sm font-bold ml-4">
                {selectedIds.length} ítems seleccionados
              </span>
              <Button 
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest px-8 transition-all"
                onClick={handleDespachoMasivo}
                disabled={loading}
              >
                Confirmar Despacho Masivo
              </Button>
            </div>
          )}

          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 w-12 text-center">
                      <input 
                        type="checkbox" 
                        checked={devoluciones.length > 0 && selectedIds.length === devoluciones.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(devoluciones.map(d => d.id));
                          else setSelectedIds([]);
                        }}
                        className="w-4 h-4 accent-[#2ec4f1] rounded border-slate-300 cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">ID / Fecha</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Serie (SN)</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente / Origen</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Orden de Servicio</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estatus</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {devoluciones.map((dev) => (
                    <tr 
                      key={dev.id} 
                      className={`hover:bg-slate-50/50 transition-colors cursor-pointer group ${selectedDev?.id === dev.id ? 'bg-[#2ec4f1]/5' : ''} ${selectedIds.includes(dev.id) ? 'bg-blue-50/50' : ''}`}
                      onClick={() => setSelectedDev(dev)}
                    >
                      <td className="px-6 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(dev.id)} 
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds(prev => [...prev, dev.id]);
                            else setSelectedIds(prev => prev.filter(id => id !== dev.id));
                          }}
                          className="w-4 h-4 accent-[#2ec4f1] rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-[#181c3a]">{dev.id}</span>
                          <span className="text-[10px] font-medium text-slate-400">{dev.fecha}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-sm font-mono font-bold text-slate-600">{dev.sn}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-xs font-bold text-slate-700">{dev.cliente}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-black uppercase tracking-tight text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{(dev as any).motivo}</span>
                      </td>
                      <td className="px-6 py-5">
                        <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[10px] px-2 py-0.5">{(dev as any).os || '---'}</Badge>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${dev.estatus === 'Procesado' ? 'bg-emerald-500' : dev.estatus === 'Pendiente' ? 'bg-amber-400' : 'bg-rose-500'}`} />
                          <span className="text-[10px] font-black uppercase tracking-tight text-slate-600">{dev.estatus}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors"
                            title="Deshacer Devolución (Regresar a Backoffice)"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUndoDevolution(dev);
                            }}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button 
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-[#2ec4f1] hover:text-white transition-colors"
                            title="Ver Detalles"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                          </button>
                          <button 
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-colors"
                            title="Eliminar Registro"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDevolution(dev);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Panel de Procesamiento */}
        <div className="lg:col-span-4 space-y-6">
          {!selectedDev ? (
            <Card className="h-full flex flex-col items-center justify-center bg-slate-50 border-dashed border-2 py-32 opacity-50">
              <RotateCcw className="w-16 h-16 text-[#181c3a] mb-4" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Seleccione un retorno para procesar</p>
            </Card>
          ) : (
            <div className="space-y-6 animate-rise-in">
              <Card className="bg-[#181c3a] text-white border-none overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <FileWarning className="w-32 h-32" />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="flex justify-between items-start">
                    <Badge className="bg-[#2ec4f1]/20 text-[#2ec4f1] border-none">Validación de Garantía</Badge>
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{selectedDev.id}</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{selectedDev.sn}</h2>
                    <p className="text-sm font-bold text-white/60">{selectedDev.cliente}</p>
                  </div>
                </div>
              </Card>

              <Card className="space-y-8">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <ClipboardList className="w-5 h-5 text-[#2ec4f1]" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-[#181c3a]">Inspección de Entrada</h3>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Motivo Declarado</p>
                    <p className="text-sm font-bold text-slate-700">{selectedDev.motivo}</p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Checklist de Recepción</h4>
                    <div className="space-y-3">
                      {[
                        'Serie Coincide con Registro',
                        'Caja Original Presente',
                        'Accesorios Completos',
                        'Daño Físico Visible',
                        'Sello de Garantía Intacto'
                      ].map((item) => (
                        <label key={item} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-all cursor-pointer">
                          <span className="text-xs font-bold text-slate-600">{item}</span>
                          <input type="checkbox" className="w-4 h-4 accent-[#2ec4f1]" />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dictamen Preliminar</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold outline-none">
                      <option>Enviar a Taller (Garantía)</option>
                      <option>Rechazar - Mal uso</option>
                      <option>Rechazar - Serie Incorrecta</option>
                      <option>Ingresar a Stock (Cambio)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setSelectedDev(null)}>Cerrar</Button>
                    <Button variant="primary" className="flex-1 shadow-lg shadow-[#181c3a]/20">Confirmar Recepción</Button>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full text-rose-500 border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    onClick={() => handleUndoDevolution()}
                    disabled={loading}
                    leftIcon={<RotateCcw className="w-4 h-4" />}
                  >
                    Deshacer: Regresar a Clasificación (Backoffice)
                  </Button>
                </div>
              </Card>

              <Card className="bg-amber-50 border-amber-100 flex items-start gap-4" padding="md">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-amber-900 uppercase mb-1">Nota Crítica</p>
                  <p className="text-[10px] text-amber-700 font-medium">Este equipo ya cuenta con 2 ingresos previos por el mismo motivo. Escalar a Supervisor.</p>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Modal Registrar Retorno */}
      {showNewReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
          <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden">
            <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <RotateCcw className="w-6 h-6 text-[#2ec4f1]" />
                <h3 className="text-xl font-bold uppercase tracking-tight">Registrar Nuevo Retorno</h3>
              </div>
              <button onClick={() => setShowNewReturnModal(false)} className="text-white/40 hover:text-white">✕</button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">ID Recepción Original</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 000101"
                    className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                    value={newReturn.originalGuide}
                    onChange={e => setNewReturn({...newReturn, originalGuide: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Número de Serie (SN)</label>
                  <input 
                    type="text" 
                    placeholder="Pistoleé la serie..."
                    className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                    value={newReturn.sn}
                    onChange={e => setNewReturn({...newReturn, sn: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destino de Devolución</label>
                <div className="w-full h-12 bg-slate-100 border border-slate-100 rounded-xl px-4 text-sm font-bold flex items-center text-slate-500">
                  BODEGA DEVOLUCIÓN (Automático)
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo de Devolución</label>
                <select 
                  className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                  value={newReturn.motivo}
                  onChange={e => setNewReturn({...newReturn, motivo: e.target.value})}
                >
                  {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Guía de Salida (Retorno)</label>
                  <div className="relative">
                    <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2ec4f1] w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="G-SALIDA-XXXX"
                      className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                      value={newReturn.guiaSalida}
                      onChange={e => setNewReturn({...newReturn, guiaSalida: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente / Destino</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Tienda Central"
                    className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                    value={newReturn.cliente}
                    onChange={e => setNewReturn({...newReturn, cliente: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="outline" className="flex-1 h-12 font-black uppercase tracking-widest text-[10px]" onClick={() => setShowNewReturnModal(false)}>Cancelar</Button>
                <Button 
                  variant="primary" 
                  className="flex-1 h-12 font-black uppercase tracking-widest text-[10px] bg-[#181c3a]" 
                  onClick={handleRegisterReturn}
                  disabled={!newReturn.sn || !newReturn.originalGuide}
                >
                  Guardar y Generar Registro
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </ModulePage>
  );
}
