"use client";

import React, { useState, useMemo } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card, Badge, Button, notify, confirmDialog, DataTable, type DataTableColumn } from '@/components/ui';
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
import { registerNewReturn, processFullReceptionReturn, undoFullReceptionReturn, processBlockReturnBySapTransfer, getSapBlockReturnRows, getBoxReturnRows, dispatchReturnItems, dispatchBoxReturns, undoBoxReturnFromClassification, type ReturnDispatchTarget, type BoxReturnDispatchTarget, type BoxReturnRow } from '@/lib/database/returns';
import { getAgencies } from '@/lib/database/config';
import { BodegaDevolucionTable } from './components/BodegaDevolucionTable';
import type { CatalogAgency } from '@/app/(erp)/produccion/backoffice/types';
import { getReceptions } from '@/lib/database/receptions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getActualUserFullName } from '@/lib/auth';
import { useEffect } from 'react';

type DevolucionTab = 'BODEGA DEVOLUCIÓN' | 'EQUIPOS DEVUELTOS';

type Devolucion = {
  id: string;
  sn: string;
  cliente: string;
  motivo: string;
  fecha: string;
  estatus: 'Pendiente' | 'Procesado' | 'Rechazado';
  tecnico?: string;
  receptionId?: string;
  dbId?: string;
  isSapBlock?: boolean;
  isReception?: boolean;
  isBoxReturn?: boolean;
  serviceOrderId?: string;
  seriesId?: string;
  sapTransferId?: string;
  sapDocument?: string;
  os?: string;
  classifiedBy?: string;
  guiaEnvio?: string;
  timestamp?: number;
  agencyRaw?: string;
};

const buildEquipmentDispatchTarget = (dev: Devolucion): ReturnDispatchTarget | null => {
  if (dev.estatus === 'Procesado') return null;
  if (dev.isSapBlock && dev.serviceOrderId) {
    return {
      isSapBlock: true,
      serviceOrderId: dev.serviceOrderId,
      sapTransferId: dev.sapTransferId,
      seriesId: dev.seriesId,
    };
  }
  if (dev.seriesId) {
    return { seriesId: dev.seriesId };
  }
  return null;
};

const buildBoxDispatchTarget = (dev: Devolucion): BoxReturnDispatchTarget | null => {
  if (dev.estatus === 'Procesado' || !dev.isBoxReturn || !dev.dbId || !dev.receptionId) return null;
  return {
    isBoxReturn: true,
    receptionGuideId: dev.dbId,
    receptionId: dev.receptionId,
    guideNumber: dev.sn,
  };
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
  const [activeCategory, setActiveCategory] = useState<DevolucionTab>('BODEGA DEVOLUCIÓN');
  const [searchTerm, setSearchTerm] = useState('');
  // C5: el input sigue ligado a searchTerm; el filtrado se recomputa con el debounced.
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const [agencies, setAgencies] = useState<CatalogAgency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState('');
  const [selectedDev, setSelectedDev] = useState<Devolucion | null>(null);
  const [boxRows, setBoxRows] = useState<BoxReturnRow[]>([]);
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
    category: 'EQUIPOS DEVUELTOS' as DevolucionTab
  });

  const [returnReceptionId, setReturnReceptionId] = useState<string | null>(null);
  const [returnReceptionData, setReturnReceptionData] = useState<any>(null);
  const [returnSeriesData, setReturnSeriesData] = useState<any[]>([]);
  const [fullReturnForm, setFullReturnForm] = useState({ motivo: '', guiaSalida: '', observaciones: '' });
  const [dispatchGuiaSalida, setDispatchGuiaSalida] = useState('');

  useEffect(() => {
    void getAgencies().then((rows) => {
      setAgencies(
        rows.map((a: { code: string; name: string; manager?: string; email?: string; address?: string; phone?: string }) => ({
          id: a.code,
          name: a.name,
          manager: a.manager || 'Encargado Pendiente',
          email: a.email || 'correo@agencia.com',
          direccion: a.address || 'Dirección no registrada',
          telefono: a.phone || '000-000-0000',
        }))
      );
    });
  }, []);

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

  useEffect(() => {
    setSelectedDev(null);
    setSelectedIds([]);
    setDispatchGuiaSalida('');
    setSelectedAgencyId('');
  }, [activeCategory]);

  const resolveAgencyIdForRow = (row: BoxReturnRow | Devolucion) => {
    const raw = row.agencyRaw || row.cliente;
    if (!raw) return '';
    const match = agencies.find(
      (a) =>
        a.id === raw ||
        a.name.toLowerCase() === raw.toLowerCase() ||
        raw.toLowerCase().includes(a.name.toLowerCase())
    );
    return match?.id || '';
  };

  const selectBoxRow = (row: BoxReturnRow) => {
    setSelectedDev(row as Devolucion);
    setDispatchGuiaSalida('');
    setSelectedAgencyId(resolveAgencyIdForRow(row));
  };

  const getDestinationAgencyLabel = () => {
    const agency = agencies.find((a) => a.id === selectedAgencyId);
    return agency?.name || selectedDev?.cliente || '';
  };

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
      notify.warning("Motivo y Guía de Salida son obligatorios.");
      return;
    }
    setLoading(true);

    const supabase = getSupabaseBrowserClient();

    const userName = getActualUserFullName();
    const res = await processFullReceptionReturn(returnReceptionId!, fullReturnForm, userName);
    setLoading(false);
    if (res.error) {
      notify.error("Error: " + res.error);
    } else {
      notify.success("Devolución procesada", { description: "El lote y sus equipos ahora están en la bandeja de Devoluciones pendientes." });
      window.location.href = '/logistica/devoluciones';
    }
  };

  const fetchReturns = async () => {
    setLoading(true);
    try {
      if (activeCategory === 'BODEGA DEVOLUCIÓN') {
        const rows = await getBoxReturnRows();
        setBoxRows(rows);
      } else {
        const sapBlockRows = await getSapBlockReturnRows();
        setDevoluciones(sapBlockRows as Devolucion[]);
      }
    } catch (err) {
      console.error("Error in fetchReturns:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredBoxRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return boxRows;
    return boxRows.filter((row) =>
      [row.id, row.sn, row.cliente, row.motivo, row.processUser, row.transferNotes, row.agencyRaw]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [boxRows, debouncedSearch]);

  const filteredDevoluciones = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return devoluciones;
    return devoluciones.filter((dev) =>
      [dev.id, dev.sn, dev.cliente, dev.motivo, dev.os, dev.classifiedBy, dev.guiaEnvio]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [devoluciones, debouncedSearch]);

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
          const proceed = await confirmDialog({
            title: 'Devolución en bloque',
            message: `${block.error}\n\n¿Desea procesar la devolución en bloque de todo el Documento SAP ahora?`,
            confirmText: 'Procesar en bloque',
          });
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
              notify.error(blockRes.error);
            } else {
              await fetchReturns();
              setShowNewReturnModal(false);
              setNewReturn({ originalGuide: '', sn: '', cliente: '', motivo: RETURN_REASONS[0], guiaSalida: '', category: activeCategory });
              notify.success(`Devolución en bloque aplicada a ${blockRes.unitsCount} equipos del mismo Documento SAP.`);
            }
          }
        } else {
          notify.error(result.error);
        }
      } else {
        await fetchReturns();
        setShowNewReturnModal(false);
        setNewReturn({ originalGuide: '', sn: '', cliente: '', motivo: RETURN_REASONS[0], guiaSalida: '', category: activeCategory });
        notify.success("Retorno registrado exitosamente.");
      }
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleDespachoMasivo = async () => {
    const guia = dispatchGuiaSalida.trim();
    if (!guia) {
      notify.warning('Ingrese la guía de salida antes de confirmar el despacho.');
      return;
    }
    if (activeCategory === 'BODEGA DEVOLUCIÓN' && !selectedAgencyId) {
      notify.warning('Seleccione la agencia de destino antes de despachar.');
      return;
    }
    if (!(await confirmDialog({ title: 'Despacho masivo', message: `¿Despachar ${selectedIds.length} retorno(s) con guía ${guia}?`, confirmText: 'Despachar' }))) return;

    setLoading(true);
    try {
      const userName = (await getActualUserFullName()) || 'SISTEMA';
      const destinationAgency = getDestinationAgencyLabel();

      if (activeCategory === 'BODEGA DEVOLUCIÓN') {
        const itemsToUpdate = filteredBoxRows.filter((d) => selectedIds.includes(d.id));
        const targets = itemsToUpdate
          .map((item) => buildBoxDispatchTarget(item as Devolucion))
          .filter((t): t is BoxReturnDispatchTarget => t !== null);
        if (targets.length === 0) {
          notify.warning('Los ítems seleccionados ya fueron despachados o no son válidos.');
          return;
        }
        const res = await dispatchBoxReturns(targets, guia, userName, destinationAgency);
        if (res.error) {
          notify.error(res.error);
          return;
        }
        notify.success(`Despacho confirmado (${res.dispatchedCount || 0} caja(s)). Se generará el conduce.`);
        printConduce(itemsToUpdate);
      } else {
        const itemsToUpdate = filteredDevoluciones.filter((d) => selectedIds.includes(d.id));
        const targets = itemsToUpdate
          .map((item) => buildEquipmentDispatchTarget(item))
          .filter((t): t is ReturnDispatchTarget => t !== null);
        if (targets.length === 0) {
          notify.warning('Los ítems seleccionados ya fueron despachados o no son válidos.');
          return;
        }
        const res = await dispatchReturnItems(targets, guia, userName);
        if (res.error) {
          notify.error(res.error);
          return;
        }
        notify.success(`Despacho confirmado (${res.dispatchedCount || 0} serie(s)). Se generará el conduce.`);
        printConduce(itemsToUpdate);
      }

      setSelectedIds([]);
      setDispatchGuiaSalida('');
      await fetchReturns();
    } catch (err: any) {
      notify.error('Error en despacho masivo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDispatchSingle = async () => {
    if (!selectedDev) return;
    const guia = dispatchGuiaSalida.trim();
    if (!guia) {
      notify.warning('Ingrese la guía de salida (courier) antes de despachar.');
      return;
    }
    if (activeCategory === 'BODEGA DEVOLUCIÓN' && !selectedAgencyId) {
      notify.warning('Seleccione la agencia de destino antes de despachar.');
      return;
    }

    const label = selectedDev.os && selectedDev.os !== '---' ? selectedDev.os : selectedDev.sn;
    if (!(await confirmDialog({ title: 'Despachar retorno', message: `¿Despachar ${label} con guía ${guia}?`, confirmText: 'Despachar' }))) return;

    setLoading(true);
    try {
      const userName = (await getActualUserFullName()) || 'SISTEMA';
      const destinationAgency = getDestinationAgencyLabel();

      if (selectedDev.isBoxReturn || activeCategory === 'BODEGA DEVOLUCIÓN') {
        const target = buildBoxDispatchTarget(selectedDev);
        if (!target) {
          notify.warning('Este retorno ya fue despachado o no se puede procesar.');
          return;
        }
        const res = await dispatchBoxReturns([target], guia, userName, destinationAgency);
        if (res.error) {
          notify.error(res.error);
          return;
        }
        notify.success(`Despacho de caja confirmado (${res.dispatchedCount || 0}).`);
      } else {
        const target = buildEquipmentDispatchTarget(selectedDev);
        if (!target) {
          notify.warning('Este retorno ya fue despachado o no se puede procesar.');
          return;
        }
        const res = await dispatchReturnItems([target], guia, userName);
        if (res.error) {
          notify.error(res.error);
          return;
        }
        notify.success(`Despacho confirmado (${res.dispatchedCount || 0} serie(s)).`);
      }

      printConduce([selectedDev]);
      setSelectedDev(null);
      setDispatchGuiaSalida('');
      await fetchReturns();
    } catch (err: any) {
      notify.error('Error al despachar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUndoDevolution = async (dev?: Devolucion) => {
    const targetDev = dev || selectedDev;
    if (!targetDev) return;

    if (targetDev.isBoxReturn && targetDev.dbId && targetDev.receptionId) {
      if (!(await confirmDialog({ title: 'Regresar a Clasificación', message: `¿Regresar la guía ${targetDev.sn} a Clasificación en Backoffice?`, confirmText: 'Regresar' }))) return;
      setLoading(true);
      try {
        const userName = (await getActualUserFullName()) || 'SISTEMA';
        const res = await undoBoxReturnFromClassification(
          targetDev.dbId,
          targetDev.receptionId,
          targetDev.sn,
          userName
        );
        if (res.error) throw new Error(res.error);
        notify.success('La caja ha regresado a Clasificación en Backoffice.');
        await fetchReturns();
        setSelectedDev(null);
      } catch (err: any) {
        notify.error('Error al intentar revertir: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (targetDev.receptionId && !targetDev.isBoxReturn) {
      if (!(await confirmDialog({ title: 'Revertir devolución', message: `Se revertirá la devolución de todos los equipos asociados a la guía del lote. ¿Está seguro de continuar?`, confirmText: 'Revertir' }))) return;
      setLoading(true);
      try {
        const res = await undoFullReceptionReturn(targetDev.receptionId);
        if (res.error) throw new Error(res.error);
        notify.success("El lote y todos sus equipos han regresado a Clasificación.");
        await fetchReturns();
        setSelectedDev(null);
      } catch (err: any) {
        notify.error("Error al intentar revertir: " + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!(await confirmDialog({ title: 'Regresar a Clasificación', message: `¿Está seguro de regresar la guía ${targetDev.sn} a Clasificación (Backoffice)? Esto eliminará la devolución actual.`, confirmText: 'Regresar' }))) return;
    
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

      notify.success("La guía ha sido regresada a Backoffice exitosamente", { description: "Verifique en Consultador la Línea de Tiempo." });
      await fetchReturns();
      setSelectedDev(null);
    } catch (err: any) {
      console.error(err);
      notify.error("Error al intentar revertir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevolution = async (dev: Devolucion) => {
    if (!(await confirmDialog({ title: 'Descartar registro', message: `¿Está seguro de OCULTAR/DESCARTAR el registro ${dev.sn}? El registro se conservará pero ya no aparecerá en esta lista.`, tone: 'error', confirmText: 'Descartar' }))) return;
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase not configured");

      if (dev.isBoxReturn && dev.receptionId) {
        if (!(await confirmDialog({ title: 'Ocultar devolución', message: `¿Ocultar la devolución de caja ${dev.sn}? La recepción se archivará.`, confirmText: 'Ocultar' }))) {
          setLoading(false);
          return;
        }
        await supabase.from('receptions').update({ status: 'ARCHIVADO' }).eq('id', dev.receptionId);
      } else if ((dev as any).isReception) {
         if (!(await confirmDialog({ title: 'Descartar lote completo', message: `Este registro representa un Lote de Devolución de Backoffice. ¿Desea descartar y ocultar todo el Lote completo?`, tone: 'error', confirmText: 'Descartar lote' }))) {
             setLoading(false);
             return;
         }
         await supabase.from('receptions').update({ status: 'ARCHIVADO' }).eq('id', (dev as any).dbId);
      } else {
         if (dev.receptionId) {
            if (!(await confirmDialog({ title: 'Descartar lote completo', message: `Este equipo pertenece a un lote de devolución procesado. ¿Desea descartar TODO el lote y ocultar todos sus equipos asociados?`, tone: 'error', confirmText: 'Descartar lote' }))) {
                setLoading(false);
                return;
            }
            await supabase.from('series').update({ current_status: 'archivado' }).eq('current_reception_id', dev.receptionId);
            await supabase.from('receptions').update({ status: 'ARCHIVADO' }).eq('id', dev.receptionId);
         } else {
            await supabase.from('series').update({ current_status: 'archivado' }).eq('id', (dev as any).dbId);
         }
      }

      notify.success("Registro descartado y ocultado exitosamente.");
      await fetchReturns();
      setSelectedDev(null);
    } catch (e: any) {
      notify.error("Error al descartar: " + e.message);
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

  const allDevolucionesSelected =
    filteredDevoluciones.length > 0 && selectedIds.length === filteredDevoluciones.length;

  const devolucionColumns: DataTableColumn<Devolucion>[] = [
    {
      id: 'select',
      header: (
        <input
          type="checkbox"
          checked={allDevolucionesSelected}
          onChange={(e) => {
            if (e.target.checked) setSelectedIds(filteredDevoluciones.map((d) => d.id));
            else setSelectedIds([]);
          }}
          className="w-4 h-4 accent-[#2ec4f1] rounded border-slate-300 cursor-pointer"
        />
      ),
      width: '52px',
      align: 'center',
      cell: (dev) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
          <input
            type="checkbox"
            checked={selectedIds.includes(dev.id)}
            onChange={(e) => {
              if (e.target.checked) setSelectedIds((prev) => [...prev, dev.id]);
              else setSelectedIds((prev) => prev.filter((id) => id !== dev.id));
            }}
            className="w-4 h-4 accent-[#2ec4f1] rounded border-slate-300 cursor-pointer"
          />
        </div>
      ),
    },
    {
      id: 'idfecha',
      header: 'ID / Fecha',
      width: 'minmax(140px,1fr)',
      cell: (dev) => (
        <div className="flex flex-col">
          <span className="text-sm font-black text-[#181c3a]">{dev.id}</span>
          <span className="text-[10px] font-medium text-slate-400">{dev.fecha}</span>
        </div>
      ),
    },
    {
      id: 'sn',
      header: 'Serie (SN)',
      width: 'minmax(140px,1fr)',
      cell: (dev) => <span className="text-sm font-mono font-bold text-slate-600">{dev.sn}</span>,
    },
    {
      id: 'cliente',
      header: 'Cliente / Origen',
      width: 'minmax(140px,1fr)',
      cell: (dev) => <span className="text-xs font-bold text-slate-700">{dev.cliente}</span>,
    },
    {
      id: 'motivo',
      header: 'Motivo',
      width: 'minmax(160px,1.2fr)',
      cell: (dev) => (
        <span className="text-[10px] font-black uppercase tracking-tight text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
          {(dev as any).motivo}
        </span>
      ),
    },
    {
      id: 'os',
      header: 'Orden de Servicio',
      width: '150px',
      cell: (dev) => (
        <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[10px] px-2 py-0.5">
          {dev.os || '---'}
        </Badge>
      ),
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '140px',
      cell: (dev) => (
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              dev.estatus === 'Procesado' ? 'bg-emerald-500' : dev.estatus === 'Pendiente' ? 'bg-amber-400' : 'bg-rose-500'
            }`}
          />
          <span className="text-[10px] font-black uppercase tracking-tight text-slate-600">{dev.estatus}</span>
        </div>
      ),
    },
    {
      id: 'accion',
      header: 'Acción',
      width: '150px',
      align: 'right',
      cell: (dev) => (
        <div className="flex items-center justify-end gap-2">
          <button
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors"
            title="Deshacer Devolución (Regresar a Backoffice)"
            onClick={(e) => { e.stopPropagation(); handleUndoDevolution(dev); }}
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
            onClick={(e) => { e.stopPropagation(); handleDeleteDevolution(dev); }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ModulePage
      title="Gestión de Devoluciones"
      subtitle="Control de retornos, garantías y reversión de logística. Trazabilidad completa desde el cliente hasta el taller."
      category="Logística"
      actions={
        <div className="flex gap-3">
          <Button variant="outline" leftIcon={<History className="w-4 h-4" />}>Reporte Mensual</Button>
          {activeCategory === 'EQUIPOS DEVUELTOS' && (
            <Button 
              variant="primary" 
              leftIcon={<RotateCcw className="w-4 h-4" />}
              onClick={() => setShowNewReturnModal(true)}
            >
              Registrar Retorno
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-8 border-b border-slate-100 flex gap-8">
        {(['BODEGA DEVOLUCIÓN', 'EQUIPOS DEVUELTOS'] as DevolucionTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveCategory(tab)}
            className={`pb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] relative transition-colors ${
              activeCategory === tab ? 'text-[#181c3a]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab}
            {activeCategory === tab && (
              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#2ec4f1] rounded-t-full" />
            )}
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* Listado de Devoluciones */}
        <div className="lg:col-span-8 space-y-6">
          {activeCategory === 'BODEGA DEVOLUCIÓN' && (
            <div className="flex items-center justify-between px-2">
              <div>
                <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-tight">Inventario Bodega Devolución</h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-2">
                  Cajas enviadas desde clasificación Backoffice
                </p>
              </div>
              <div className="px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-rose-50 text-rose-600">
                {filteredBoxRows.length} Cajas Registradas
              </div>
            </div>
          )}

          <ModuleToolbar 
            onSearch={setSearchTerm}
            searchValue={searchTerm}
            addLabel={activeCategory === 'EQUIPOS DEVUELTOS' ? 'Nuevo Retorno' : undefined}
            onAdd={activeCategory === 'EQUIPOS DEVUELTOS' ? () => setShowNewReturnModal(true) : undefined}
          />

          {selectedIds.length > 0 && (
            <div className="bg-[#181c3a] p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-4 shadow-xl">
              <span className="text-white text-sm font-bold ml-4 self-center">
                {selectedIds.length} ítems seleccionados
              </span>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl">
                {activeCategory === 'BODEGA DEVOLUCIÓN' && (
                  <select
                    value={selectedAgencyId}
                    onChange={(e) => setSelectedAgencyId(e.target.value)}
                    className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-bold outline-none focus:border-[#2ec4f1]"
                  >
                    <option value="" className="text-slate-900">Agencia destino...</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id} className="text-slate-900">
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="Guía de salida (courier)..."
                  value={dispatchGuiaSalida}
                  onChange={(e) => setDispatchGuiaSalida(e.target.value.toUpperCase())}
                  className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm font-bold outline-none focus:border-[#2ec4f1]"
                />
                <Button
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest px-8 transition-all shrink-0"
                  onClick={handleDespachoMasivo}
                  disabled={loading || !dispatchGuiaSalida.trim() || (activeCategory === 'BODEGA DEVOLUCIÓN' && !selectedAgencyId)}
                >
                  Confirmar Despacho Masivo
                </Button>
              </div>
            </div>
          )}

          {activeCategory === 'BODEGA DEVOLUCIÓN' ? (
            <BodegaDevolucionTable
              rows={filteredBoxRows}
              loading={loading}
              agencies={agencies}
              selectedId={selectedDev?.id || null}
              selectedIds={selectedIds}
              onSelectRow={selectBoxRow}
              onToggleSelect={(id, checked) => {
                if (checked) setSelectedIds((prev) => [...prev, id]);
                else setSelectedIds((prev) => prev.filter((x) => x !== id));
              }}
              onToggleSelectAll={(checked) => {
                if (checked) setSelectedIds(filteredBoxRows.map((d) => d.id));
                else setSelectedIds([]);
              }}
              onUndo={(row) => void handleUndoDevolution(row as Devolucion)}
              onArchive={(row) => void handleDeleteDevolution(row as Devolucion)}
            />
          ) : (
          <Card padding="none" className="overflow-hidden">
            {loading && filteredDevoluciones.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#2ec4f1] mx-auto" />
              </div>
            ) : (
              <DataTable
                columns={devolucionColumns}
                data={filteredDevoluciones}
                getRowId={(dev: Devolucion) => dev.id}
                onRowClick={(dev: Devolucion) => { setSelectedDev(dev); setDispatchGuiaSalida(''); }}
                rowHeight={68}
                maxBodyHeight={600}
                minWidth={1040}
                headerClassName="bg-slate-50"
                emptyMessage="No hay equipos pendientes de devolución en bodega"
                rowClassName={(dev: Devolucion) =>
                  `group ${selectedDev?.id === dev.id ? 'bg-[#2ec4f1]/5' : ''} ${selectedIds.includes(dev.id) ? 'bg-blue-50/50' : ''}`
                }
              />
            )}
          </Card>
          )}
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
                    <Badge className="bg-[#2ec4f1]/20 text-[#2ec4f1] border-none">
                      {activeCategory === 'BODEGA DEVOLUCIÓN' || selectedDev.isBoxReturn
                        ? 'Bodega Devolución'
                        : selectedDev.isSapBlock
                          ? 'Devolución SAP'
                          : 'Despacho de Retorno'}
                    </Badge>
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{selectedDev.id}</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{selectedDev.sn}</h2>
                    <p className="text-sm font-bold text-white/60">{selectedDev.cliente}</p>
                    {selectedDev.os && selectedDev.os !== '---' && (
                      <p className="text-xs font-black text-[#2ec4f1] mt-2">OS: {selectedDev.os}</p>
                    )}
                    {selectedDev.guiaEnvio && (
                      <p className="text-[10px] font-bold text-white/50 mt-1">Guía envío (Backoffice): {selectedDev.guiaEnvio}</p>
                    )}
                    {selectedDev.sapDocument && selectedDev.sapDocument !== '---' && (
                      <p className="text-[10px] font-bold text-white/50 mt-1">SAP: {selectedDev.sapDocument}</p>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="space-y-8">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <ClipboardList className="w-5 h-5 text-[#2ec4f1]" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-[#181c3a]">Despacho de Salida</h3>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Motivo Declarado</p>
                    <p className="text-sm font-bold text-slate-700">{selectedDev.motivo}</p>
                  </div>

                  {selectedDev.estatus === 'Procesado' ? (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <p className="text-xs font-bold text-emerald-800">Este retorno ya fue despachado.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(activeCategory === 'BODEGA DEVOLUCIÓN' || selectedDev.isBoxReturn) && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Agencia de Destino (obligatorio)
                          </label>
                          <select
                            value={selectedAgencyId}
                            onChange={(e) => setSelectedAgencyId(e.target.value)}
                            className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all"
                          >
                            <option value="">Seleccione agencia...</option>
                            {agencies.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Guía Courier de Salida (obligatorio)
                      </label>
                      <input
                        type="text"
                        value={dispatchGuiaSalida}
                        onChange={(e) => setDispatchGuiaSalida(e.target.value.toUpperCase())}
                        placeholder="Ej. CAR-9001"
                        className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all uppercase"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">
                        {activeCategory === 'BODEGA DEVOLUCIÓN' || selectedDev.isBoxReturn
                          ? 'Despacha la caja de vuelta a la agencia seleccionada con la guía del courier.'
                          : selectedDev.isSapBlock
                            ? 'Despacha todas las series de la orden de servicio en estado devuelto.'
                            : 'Despacha los equipos devueltos del lote seleccionado.'}
                      </p>
                    </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setSelectedDev(null)}>Cerrar</Button>
                    <Button
                      variant="primary"
                      className="flex-1 shadow-lg shadow-[#181c3a]/20"
                      disabled={
                        loading ||
                        selectedDev.estatus === 'Procesado' ||
                        !dispatchGuiaSalida.trim() ||
                        ((activeCategory === 'BODEGA DEVOLUCIÓN' || selectedDev.isBoxReturn) && !selectedAgencyId)
                      }
                      onClick={handleDispatchSingle}
                    >
                      Confirmar Despacho
                    </Button>
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
