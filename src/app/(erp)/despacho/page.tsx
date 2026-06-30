"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card, Badge, Button, notify, confirmDialog, DataTable, type DataTableColumn } from '@/components/ui';
import { apiFetch } from '@/lib/http/apiFetch';
import { sapValidationReader } from '@/modules/sap-integration';
import * as XLSX from 'xlsx';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { DispatchBatchPanel } from './DispatchBatchPanel';
import { 
  Truck, 
  Package, 
  Boxes, 
  QrCode, 
  ClipboardList, 
  CheckCircle2, 
  FileText,
  Navigation,
  ArrowRight,
  Search,
  Plus,
  X,
  Trash2,
  ArrowLeft,
  Pencil,
  Upload
} from 'lucide-react';

type DispatchItem = {
  id: string;
  dbId?: string;
  brand_id?: string;
  model_id?: string;
  destino: string;
  tipo: 'Masivo' | 'Individual' | 'Master Box';
  unidades: number;
  estatus: 'Pendiente' | 'En Ruta' | 'Entregado';
  fecha?: string;
};

const EMPTY_LIST: any[] = [];

async function fetchDespachoData(supabase: any): Promise<{ history: any[]; dispatches: DispatchItem[] }> {
  // 1. Historial de despachos
  const { data: hist } = await supabase
    .from('dispatches')
    .select(`
      id, 
      guide_number, 
      dispatch_type, 
      notes, 
      created_at, 
      dispatched_by,
      dispatch_items(count)
    `)
    .order('created_at', { ascending: false });

  // 2. Cajas activas (master boxes de despacho)
  let dispatches: DispatchItem[] = [];
  const { data: recData } = await supabase.from('receptions').select('id').eq('guide_number', 'MANUAL_BOXES_DESPACHO').single();
  if (recData) {
    const { data: boxes } = await supabase.from('boxes').select('*').eq('reception_id', recData.id).order('created_at', { ascending: false });
    if (boxes && boxes.length > 0) {
      dispatches = boxes.map((b: any) => ({
        id: b.box_code,
        dbId: b.id,
        brand_id: b.brand_id,
        model_id: b.model_id,
        destino: 'Pendiente de asignar',
        tipo: 'Master Box',
        unidades: b.capacity || 0,
        estatus: b.status === 'open' ? 'Pendiente' : 'En Ruta',
        fecha: new Date(b.created_at).toLocaleDateString(),
      }));
    }
  }

  return { history: hist ?? [], dispatches };
}

async function fetchDespachoCatalogs(supabase: any) {
  const [b, m, t] = await Promise.all([
    supabase.from('brands').select('*'),
    supabase.from('models').select('*'),
    supabase.from('technologies').select('*'),
  ]);
  return { brands: b.data ?? [], models: m.data ?? [], techs: t.data ?? [] };
}

export default function DespachoPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'operacion'|'historial'>('operacion');

  const despachoQuery = useQuery({
    queryKey: ['despacho-data'],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { history: EMPTY_LIST, dispatches: EMPTY_LIST as DispatchItem[] };
      return fetchDespachoData(supabase);
    },
  });
  const dispatchHistory = despachoQuery.data?.history ?? EMPTY_LIST;

  const refreshDispatches = () => queryClient.invalidateQueries({ queryKey: ['despacho-data'] });

  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [dispatchType, setDispatchType] = useState<'massive' | 'individual' | 'master_box'>('master_box');
  const [itemsToDispatch, setItemsToDispatch] = useState<string[]>([]);
  const [scanInput, setScanInput] = useState('');

  const [showCreateBoxModal, setShowCreateBoxModal] = useState(false);
  const [boxBrand, setBoxBrand] = useState('');
  const [boxModel, setBoxModel] = useState('');
  const [boxTech, setBoxTech] = useState('');
  const [boxQty, setBoxQty] = useState<number | ''>('');
  
  const catalogsQuery = useQuery({
    queryKey: ['despacho-catalogs'],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { brands: EMPTY_LIST, models: EMPTY_LIST, techs: EMPTY_LIST };
      return fetchDespachoCatalogs(supabase);
    },
  });
  const dbBrands: any[] = catalogsQuery.data?.brands ?? EMPTY_LIST;
  const dbModels: any[] = catalogsQuery.data?.models ?? EMPTY_LIST;
  const dbTechs: any[] = catalogsQuery.data?.techs ?? EMPTY_LIST;
  const [editBoxId, setEditBoxId] = useState<string | null>(null);

  const [showUploadSAPModal, setShowUploadSAPModal] = useState(false);
  const [isUploadingSAP, setIsUploadingSAP] = useState(false);

  const handleUploadSAP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSAP(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json: any[] = XLSX.utils.sheet_to_json(worksheet);

      const updates = json.map(row => ({
        serial_number: String(row['Número de serie']).trim(),
        material: String(row['Material'] || '').trim(),
        valuation: String(row['Lote'] || '').trim(),
      })).filter(u => u.serial_number && u.serial_number !== 'undefined');

      if (updates.length === 0) {
        notify.warning('Sin registros válidos', { description: 'Verifique que exista la columna "Número de serie".' });
        setIsUploadingSAP(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      let successCount = 0;
      let errorCount = 0;
      
      const chunkSize = 50;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (u) => {
          const { error } = await supabase
            .from('series')
            .update({ material: u.material, valuation: u.valuation })
            .eq('serial_number', u.serial_number);
          if (error) {
            console.error('Error updating', u.serial_number, error);
            errorCount++;
          } else {
            successCount++;
          }
        }));
      }

      notify.success('Carga SAP completada', { description: `Procesados: ${successCount} · Errores: ${errorCount}` });
      setShowUploadSAPModal(false);

    } catch (error) {
      console.error(error);
      notify.error('Error procesando el archivo Excel.');
    } finally {
      setIsUploadingSAP(false);
    }
  };

  const dispatches = despachoQuery.data?.dispatches ?? (EMPTY_LIST as DispatchItem[]);

  const [selectedBox, setSelectedBox] = useState<DispatchItem | null>(null);
  const [boxItems, setBoxItems] = useState<any[]>([]);
  const [scanSN, setScanSN] = useState('');
  const [scanCAS, setScanCAS] = useState('');

  const loadBoxItems = async (boxDbId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from('series').select('*, service_orders(id)').eq('current_box_id', boxDbId).order('updated_at', { ascending: false });
    if (data && data.length > 0) {
      const osIds = data.map(d => d.service_orders?.id).filter(Boolean);
      let siblingsData: any[] = [];
      if (osIds.length > 0) {
        const { data: siblings } = await supabase.from('series').select('*').in('service_order_id', osIds).order('created_at', { ascending: true });
        if (siblings) siblingsData = siblings;
      }
      
      const enrichedData: any[] = [];
      const processedOsIds = new Set();

      data.forEach(item => {
        if (item.service_orders?.id) {
          if (processedOsIds.has(item.service_orders.id)) return; // Ya procesado
          processedOsIds.add(item.service_orders.id);
          
          const siblings = siblingsData.filter(s => s.service_order_id === item.service_orders.id);
          const siblingWithMaterial = siblings.find(s => s.material && s.valuation) || siblings[0] || item;

          // Asegurar que la serie principal (la de SAP) aparezca como S-1
          const mainSn = siblingWithMaterial.serial_number;
          const otherSiblings = siblings.filter(s => s.serial_number !== mainSn);
          const orderedSiblings = [siblingWithMaterial, ...otherSiblings];

          enrichedData.push({
            ...item,
            id: orderedSiblings[0]?.id || item.id,
            s1: orderedSiblings[0]?.serial_number || item.serial_number,
            s2: orderedSiblings[1]?.serial_number || '',
            s3: orderedSiblings[2]?.serial_number || '',
            s4: orderedSiblings[3]?.serial_number || '',
            material: siblingWithMaterial.material || '',
            valuation: siblingWithMaterial.valuation || ''
          });
        } else {
          enrichedData.push({
            ...item,
            s1: item.serial_number,
            s2: '',
            s3: '',
            s4: ''
          });
        }
      });
      setBoxItems(enrichedData);
    } else {
      setBoxItems([]);
    }
  };

  const handleSelectBox = (box: DispatchItem) => {
    if (!box.dbId) {
      notify.info('Esta caja es un dato de prueba.');
      return;
    }
    setSelectedBox(box);
    loadBoxItems(box.dbId);
  };

  const handleScanToBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanSN || !selectedBox?.dbId) return;
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    const { data: sData } = await supabase.from('series').select('*, service_orders(sap_integration_status)').eq('serial_number', scanSN).single();
    if (!sData) {
      notify.warning('Serie no encontrada.'); return;
    }
    
    if (sData.current_status !== 'in_central_warehouse') {
      notify.warning('El equipo no está en estado EQUIPO LISTO.'); return;
    }

    if (sData.brand_id !== selectedBox.brand_id || sData.model_id !== selectedBox.model_id) {
      notify.warning('La marca o modelo del equipo no coinciden con la caja.'); return;
    }

    // 1. Validar Matriz de Bloqueos SAP (gate vía port sap-integration)
    const sapStatus = sData.service_orders?.sap_integration_status || sData.sap_status || 'Pendiente Validación';
    const sapDecision = sapValidationReader.authorize({ integrationStatus: sapStatus }, 'dispatch');
    if (!sapDecision.allowed) {
      notify.error('Bloqueo operativo (Integración SAP)', { description: `El equipo no puede despacharse porque su estado es "${sapStatus}". Solo los equipos "Validado SAP" tienen permitido el despacho.`, duration: 0 });
      return;
    }

    // 2. Validar que el Material y Lote coincidan con el resto de la caja
    if (boxItems.length > 0) {
      const existingMaterial = boxItems[0].material;
      const existingLote = boxItems[0].valuation;
      if (sData.material !== existingMaterial || sData.valuation !== existingLote) {
        notify.error('No se pueden mezclar Material/Lote', { description: `Equipo: Material [${sData.material}] Lote [${sData.valuation}] · Caja: Material [${existingMaterial || 'N/A'}] Lote [${existingLote || 'N/A'}].`, duration: 0 });
        return;
      }
    }

    // 3. Traer las series hermanas (S1, S2, S3, S4)
    let idsToUpdate = [sData.id];
    if (sData.service_order_id) {
      const { data: siblings } = await supabase.from('series').select('*').eq('service_order_id', sData.service_order_id);
      if (siblings && siblings.length > 0) {
        // Validar si alguna serie hermana tiene un material/lote distinto (en caso de que estuvieran cargados)
        const mismatch = siblings.find(s => s.material && s.valuation && (s.material !== sData.material || s.valuation !== sData.valuation));
        if (mismatch) {
          notify.error('Falla de consistencia', { description: `La serie hermana ${mismatch.serial_number} tiene un Material/Lote distinto al de la serie escaneada.`, duration: 0 });
          return;
        }
        idsToUpdate = siblings.map(s => s.id);
      }
    }

    if (boxItems.length >= selectedBox.unidades) {
      notify.warning('La caja ya está llena.'); return;
    }

    const { error } = await supabase.from('series').update({ current_box_id: selectedBox.dbId }).in('id', idsToUpdate);
    if (error) {
      notify.error('Error al asignar equipo a la caja.');
    } else {
      setScanSN('');
      setScanCAS('');
      loadBoxItems(selectedBox.dbId);
    }
  };

  const handleRemoveFromBox = async (seriesId: string) => {
    if (!selectedBox?.dbId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    // Buscar si tiene hermanos para removerlos todos
    const { data: sData } = await supabase.from('series').select('service_order_id').eq('id', seriesId).single();
    let idsToRemove = [seriesId];
    if (sData?.service_order_id) {
      const { data: siblings } = await supabase.from('series').select('id').eq('service_order_id', sData.service_order_id);
      if (siblings) idsToRemove = siblings.map(s => s.id);
    }

    const { error } = await supabase.from('series').update({ current_box_id: null }).in('id', idsToRemove);
    if (!error) {
      loadBoxItems(selectedBox.dbId);
    }
  };

  const handleCreateBox = async () => {
    if (!boxBrand || !boxModel || !boxQty) return;
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      // Find the dummy reception for despacho
      let receptionId;
      const { data: recData } = await supabase.from('receptions').select('id').eq('guide_number', 'MANUAL_BOXES_DESPACHO').single();
      if (recData) {
        receptionId = recData.id;
      } else {
        notify.error('No se encontró la recepción base para despacho.');
        return;
      }

      // Generate consecutive unrepeatable box code
      const { data: existingBoxes } = await supabase
        .from('boxes')
        .select('box_code')
        .like('box_code', 'MB-%');
        
      let nextNum = 1;
      if (existingBoxes && existingBoxes.length > 0) {
        existingBoxes.forEach(box => {
          const match = (box.box_code || '').match(/^MB-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= nextNum) nextNum = num + 1;
          }
        });
      }
      
      const boxCode = `MB-${nextNum.toString().padStart(6, '0')}`;
      
      if (editBoxId) {
        const { error } = await supabase.from('boxes').update({
          brand_id: boxBrand,
          model_id: boxModel,
          capacity: Number(boxQty)
        }).eq('id', editBoxId);

        if (error) {
          console.error(error);
          notify.error('Error al actualizar la caja', { description: error.message });
        } else {
          notify.success('Caja actualizada con éxito.');
          setShowCreateBoxModal(false);
          setBoxBrand(''); setBoxModel(''); setBoxTech(''); setBoxQty('');
          setEditBoxId(null);
          await refreshDispatches();
        }
      } else {
        const { error } = await supabase.from('boxes').insert({
          reception_id: receptionId,
          box_code: boxCode,
          brand_id: boxBrand,
          model_id: boxModel,
          capacity: Number(boxQty),
          status: 'open',
          rack_location: 'DESPACHO'
        });

        if (error) {
          console.error(error);
          notify.error('Error al crear la caja', { description: error.message });
        } else {
          notify.success(`Caja ${boxCode} creada con éxito.`);
          setShowCreateBoxModal(false);
          setBoxBrand(''); setBoxModel(''); setBoxTech(''); setBoxQty('');
          await refreshDispatches();
        }
      }


    } catch (e) {
      console.error(e);
      notify.error('Error inesperado al guardar la caja.');
    }
  };

  const handleEditBox = (disp: DispatchItem) => {
    if (!disp.dbId) return;
    setEditBoxId(disp.dbId);
    setBoxBrand(disp.brand_id || '');
    setBoxModel(disp.model_id || '');
    setBoxQty(disp.unidades);
    setShowCreateBoxModal(true);
  };

  const handleDeleteBox = async (disp: DispatchItem) => {
    if (!disp.dbId) return;
    if (!(await confirmDialog({ title: 'Eliminar caja', message: `¿Eliminar la caja ${disp.id}? Todos los equipos dentro volverán a estar libres.`, tone: 'error', confirmText: 'Eliminar' }))) return;
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      const { error } = await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', disp.dbId);
      if (error) {
        console.error(error);
        notify.error('Error al eliminar la caja', { description: error.message });
      } else {
        notify.success('Caja eliminada con éxito.');
        await refreshDispatches();
      }
    } catch (e) {
      console.error(e);
      notify.error('Error inesperado al eliminar.');
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput) return;
    setItemsToDispatch([scanInput, ...itemsToDispatch]);
    setScanInput('');
  };

  const printBoxLabel = () => {
    if (!selectedBox) return;
    const brandName = dbBrands.find(b => b.id === selectedBox.brand_id)?.name || 'N/A';
    const model = dbModels.find(m => m.id === selectedBox.model_id);
    const modelName = model?.name || 'N/A';
    const techName = dbTechs.find(t => t.id === model?.technology_id)?.name || 'N/A';

    const printWindow = window.open('', '', 'width=600,height=400');
    if (!printWindow) return;

    const commonStyles = `
      <style>
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; text-align: center; color: #181c3a; }
        .label-container { padding: 20px; display: inline-block; min-width: 350px; margin: 0 auto; }
        .title { font-size: 14px; font-weight: 900; letter-spacing: 2px; margin-bottom: 15px; color: #64748b; text-transform: uppercase; }
        .box-id { font-size: 32px; font-weight: 900; margin-bottom: 10px; font-family: monospace; }
        .details { font-size: 16px; font-weight: bold; margin-bottom: 20px; line-height: 1.5; }
        .barcode { font-family: 'Libre Barcode 39', monospace; font-size: 50px; margin-bottom: 5px; font-weight: normal; }
        @media print {
          .page-break { page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
    `;

    const masterLabelHtml = `
      <div class="label-container" style="text-align: left; margin-top: 20px;">
        
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
          <div style="text-align: left;">
            <div class="box-id" style="font-size: 20px;">${selectedBox.id}</div>
            <div class="barcode" style="font-size: 40px; margin-bottom: 10px;">*${selectedBox.id}*</div>
          </div>
          <div>
            <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" style="height: 30px; width: auto;">
              <rect width="565" height="280" fill="#ffffff"/>
              <g fill="#2e3165"><rect x="8" y="9" width="232" height="60"/><rect x="92" y="9" width="65" height="271"/></g>
              <g fill="#2e3165"><circle cx="425" cy="140" r="140"/><circle cx="425" cy="140" r="85" fill="#ffffff"/><rect x="500" y="100" width="80" height="60" fill="#ffffff"/><circle cx="425" cy="140" r="35" fill="#2e3165"/></g>
            </svg>
          </div>
        </div>
        
        <div class="details" style="font-size: 12px; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 10px;">
          <strong>MARCA:</strong> ${brandName} &nbsp;|&nbsp; <strong>MODELO:</strong> ${modelName} <br>
          <strong>TECNOLOGÍA:</strong> ${techName}
        </div>
        
        <div class="details" style="font-size: 10px; font-family: monospace;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid #000;">
                <th style="padding: 6px 10px;">#</th>
                <th style="padding: 6px 10px;">S-1 / SN</th>
                <th style="padding: 6px 10px;">S-2</th>
                <th style="padding: 6px 10px;">S-3</th>
                <th style="padding: 6px 10px;">S-4</th>
                <th style="padding: 6px 10px;">Material</th>
                <th style="padding: 6px 10px;">Lote</th>
              </tr>
            </thead>
            <tbody>
              ${boxItems.map((s: any, idx: number) => 
                '<tr style="border-bottom: 1px solid #ccc;">' +
                  '<td style="padding: 6px 10px;">' + (idx + 1) + '</td>' +
                  '<td style="padding: 6px 10px; font-weight: bold;">' + (s.s1 || s.serial_number || '---') + '</td>' +
                  '<td style="padding: 6px 10px;">' + (s.s2 || '---') + '</td>' +
                  '<td style="padding: 6px 10px;">' + (s.s3 || '---') + '</td>' +
                  '<td style="padding: 6px 10px;">' + (s.s4 || '---') + '</td>' +
                  '<td style="padding: 6px 10px;">' + (s.material || '---') + '</td>' +
                  '<td style="padding: 6px 10px;">' + (s.valuation || '---') + '</td>' +
                '</tr>'
              ).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Impresión de Etiqueta - ${selectedBox.id}</title>
          ${commonStyles}
        </head>
        <body>
          ${masterLabelHtml}
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
    `);
    printWindow.document.close();
  };

  if (selectedBox) {
    const progress = (boxItems.length / selectedBox.unidades) * 100;
    return (
      <ModulePage
        title={'Llenado de Caja: ' + selectedBox.id}
        subtitle="Escanee los equipos para agregarlos a la caja."
        category="Despacho"
        actions={
          <Button variant="outline" onClick={() => setSelectedBox(null)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Volver a Cajas
          </Button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <Card className="p-6 space-y-6">
              <h3 className="font-bold text-slate-800">Escáner de Series</h3>
              <form onSubmit={handleScanToBox} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                    <span>SN *</span>
                    <span className="text-slate-400 font-normal">Max: 15</span>
                  </label>
                  <input
                    type="text"
                    value={scanSN}
                    onChange={e => setScanSN(e.target.value)}
                    placeholder="Escanear SN (15 dig)..."
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-[#2ec4f1] rounded-lg px-4 py-3 outline-none transition-colors font-mono font-bold"
                    autoFocus
                  />
                </div>

                <Button type="submit" variant="primary" className="w-full py-4 text-sm bg-[#181c3a] hover:bg-[#181c3a]/90 text-white">
                  Registrar Equipo (Enter)
                </Button>
              </form>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm text-slate-500 font-medium mb-4">Detalle de la Caja</h3>
              <div className="space-y-2 mb-4 text-slate-700">
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Marca</span>
                  <span className="font-medium text-sm">{dbBrands.find(b => b.id === selectedBox.brand_id)?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Modelo</span>
                  <span className="font-medium text-sm">{dbModels.find(m => m.id === selectedBox.model_id)?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Tecnología</span>
                  <span className="font-medium text-sm">{dbTechs.find(t => t.id === dbModels.find(m => m.id === selectedBox.model_id)?.technology_id)?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">QTY (Max)</span>
                  <span className="font-medium text-sm">{selectedBox.unidades}</span>
                </div>
              </div>
              <Button onClick={printBoxLabel} className="w-full mt-4" variant="outline">
                <FileText className="w-4 h-4 mr-2" /> PDF Imprimir Etiqueta
              </Button>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm text-slate-500 font-medium mb-4">Progreso de la Caja</h3>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-black text-[#181c3a]">{boxItems.length}</span>
                <span className="text-sm text-slate-400 font-medium pb-1">/ {selectedBox.unidades} equipos</span>
              </div>
              <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#181c3a] transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="p-0 overflow-hidden h-[600px] flex flex-col">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Contenido de la Caja</h3>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white/90 backdrop-blur border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">S1 / SN</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">S2</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">S3</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">S4</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Material</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Lote</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {boxItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-xs font-bold text-slate-500">{boxItems.length - idx}</td>
                        <td className="px-6 py-4">
                          <span className="font-mono font-bold text-emerald-600 text-sm">{item.s1 || item.serial_number}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{item.s2 || '---'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{item.s3 || '---'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{item.s4 || '---'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{item.material || '---'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{item.valuation || '---'}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleRemoveFromBox(item.id)} className="text-rose-400 hover:text-rose-600 p-2 transition-colors" title="Eliminar de la caja">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {boxItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                          La caja está vacía. Escanee equipos para llenarla.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </ModulePage>
    );
  }

  const dispatchColumns: DataTableColumn<any>[] = [
    {
      id: 'id',
      header: 'ID Manifiesto',
      width: 'minmax(200px,1.5fr)',
      cell: (disp: DispatchItem) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-[#181c3a] group-hover:text-white transition-colors">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-sm font-black text-[#181c3a] font-mono">{disp.id}</span>
        </div>
      ),
    },
    {
      id: 'fecha',
      header: 'Fecha',
      width: '130px',
      cell: (disp: DispatchItem) => <span className="text-xs font-bold text-slate-500">{disp.fecha}</span>,
    },
    {
      id: 'destino',
      header: 'Destino',
      width: 'minmax(160px,1fr)',
      cell: (disp: DispatchItem) => (
        <div className="flex items-center gap-2">
          <Navigation className="w-3 h-3 text-[#2ec4f1]" />
          <span className="text-xs font-bold text-slate-700">{disp.destino}</span>
        </div>
      ),
    },
    {
      id: 'tipo',
      header: 'Tipo',
      width: '130px',
      cell: (disp: DispatchItem) => <Badge variant="blue">{disp.tipo}</Badge>,
    },
    {
      id: 'unidades',
      header: 'Unidades',
      width: '110px',
      cell: (disp: DispatchItem) => <span className="text-sm font-bold text-slate-700">{disp.unidades}</span>,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '150px',
      cell: (disp: DispatchItem) => (
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${disp.estatus === 'Entregado' ? 'bg-emerald-500' : disp.estatus === 'En Ruta' ? 'bg-[#2ec4f1]' : 'bg-amber-400'}`} />
          <span className="text-[10px] font-black uppercase tracking-tight text-slate-600">{disp.estatus}</span>
        </div>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: '170px',
      align: 'right',
      cell: (disp: DispatchItem) => (
        <div className="flex items-center justify-end gap-2">
          <div
            onClick={(e) => { e.stopPropagation(); handleEditBox(disp); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer transition-colors"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </div>
          <div
            onClick={(e) => { e.stopPropagation(); handleDeleteBox(disp); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </div>
          <div
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer transition-colors"
            title="Entrar"
          >
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      ),
    },
  ];

  const dispatchHistoryColumns: DataTableColumn<any>[] = [
    {
      id: 'guia',
      header: 'Guía / Destino',
      width: 'minmax(200px,1.5fr)',
      cell: (hist: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Truck className="w-4 h-4" />
          </div>
          <span className="text-sm font-black text-[#181c3a] font-mono">{hist.guide_number}</span>
        </div>
      ),
    },
    {
      id: 'fecha',
      header: 'Fecha',
      width: '180px',
      cell: (hist: any) => <span className="text-xs font-bold text-slate-500">{new Date(hist.created_at).toLocaleString()}</span>,
    },
    {
      id: 'tipo',
      header: 'Tipo',
      width: '130px',
      cell: (hist: any) => <Badge variant="blue">{hist.dispatch_type}</Badge>,
    },
    {
      id: 'items',
      header: 'Items / Cajas',
      width: '130px',
      cell: (hist: any) => <span className="text-sm font-bold text-slate-700">{hist.dispatch_items?.[0]?.count || 0}</span>,
    },
    {
      id: 'usuario',
      header: 'Usuario',
      width: 'minmax(140px,1fr)',
      cell: (hist: any) => <span className="text-xs font-bold text-slate-500">{hist.dispatched_by || 'Sistema'}</span>,
    },
  ];

  return (
    <ModulePage
      title="Despacho Final & Logística de Salida"
      subtitle="Gestión de salidas masivas, individuales y consolidación en Master Boxes para transporte optimizado."
      category="Despacho"
      actions={
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowUploadSAPModal(true)} leftIcon={<Upload className="w-4 h-4" />}>
            Cargar Excel SAP
          </Button>
          <Button variant="outline" onClick={() => setShowCreateBoxModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Crear Caja
          </Button>
          <Button variant="primary" onClick={() => setShowDispatchForm(!showDispatchForm)} leftIcon={<Truck className="w-4 h-4" />}>
            {showDispatchForm ? 'Cancelar Despacho' : 'Nuevo Despacho'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('operacion')}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'operacion' ? 'bg-white text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Gestión de Cajas & Despachos
          </button>
          <button 
            onClick={() => setActiveTab('historial')}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'historial' ? 'bg-white text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Historial de Despachos
          </button>
          <button 
            onClick={() => setActiveTab('cqrs' as any)}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${(activeTab as any) === 'cqrs' ? 'bg-[#2ec4f1] text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-[#2ec4f1]'}`}
          >
            <Boxes className="w-4 h-4" />
            Pendientes (CQRS Eventos)
          </button>
          <button 
            onClick={() => setActiveTab('lotes' as any)}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${(activeTab as any) === 'lotes' ? 'bg-white text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Boxes className="w-4 h-4" />
            Lotes de salida
          </button>
        </div>

        {(activeTab as any) === 'lotes' ? (
          <DispatchBatchPanel />
        ) : (activeTab as any) === 'cqrs' ? (
          <div className="space-y-6 animate-in fade-in">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Despachos Pendientes Asíncronos</h3>
                  <p className="text-sm text-slate-500">Ordenes creadas automáticamente al finalizar reparaciones en Taller.</p>
                </div>
                <Button variant="primary" onClick={async () => {
                  try {
                    const res = await apiFetch('/api/despacho/pendientes');
                    if (res.ok) {
                      const data = await res.json();
                      const ws = XLSX.utils.json_to_sheet(data.data || []);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Despachos Pendientes");
                      XLSX.writeFile(wb, `Despachos_CQRS_${new Date().toISOString().split('T')[0]}.xlsx`);
                    } else {
                      notify.info('El nuevo módulo Despacho (Feature Flag USE_NEW_DESPACHO_MODULE) no está activo.');
                    }
                  } catch(e) {
                    console.error(e);
                  }
                }}>
                  Exportar Reporte CQRS
                </Button>
              </div>
              <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                <Truck className="w-16 h-16 text-[#2ec4f1] mb-4 opacity-50" />
                <h4 className="font-bold text-slate-600 mb-2">Módulo en modo Strangler Fig</h4>
                <p className="text-slate-400 text-sm max-w-md text-center">
                  Las órdenes se están orquestando en segundo plano gracias al Event Bus. Descarga el Excel para visualizar la data segregada (Read Model).
                </p>
              </div>
            </Card>
          </div>
        ) : activeTab === 'operacion' ? (
          <div className="space-y-10 animate-in fade-in">
        
        {showUploadSAPModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-md bg-[#181c3a] border-slate-700/50 shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-[#2ec4f1]" />
                  Cargar Validaciones SAP
                </h2>
                <button 
                  onClick={() => setShowUploadSAPModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8 bg-slate-50 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-2">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-800">Sube tu archivo Excel</h3>
                <p className="text-sm text-slate-500">
                  El archivo debe contener las columnas <strong className="text-slate-700">Número de serie</strong>, <strong className="text-slate-700">Material</strong> y <strong className="text-slate-700">Lote</strong> (Valoración).
                </p>
                <div className="relative w-full mt-4">
                  <input 
                    type="file" 
                    accept=".xlsx, .xls"
                    onChange={handleUploadSAP}
                    disabled={isUploadingSAP}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <Button variant="primary" className="w-full pointer-events-none" disabled={isUploadingSAP}>
                    {isUploadingSAP ? 'Procesando archivo...' : 'Seleccionar archivo .xlsx'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {showCreateBoxModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-lg bg-[#181c3a] border-slate-700/50 shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#2ec4f1]" />
                  Crear Caja
                </h2>
                <button 
                  onClick={() => setShowCreateBoxModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4 bg-slate-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                      value={boxTech}
                      onChange={e => setBoxTech(e.target.value)}
                    >
                      <option value="">Seleccione...</option>
                      {dbTechs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Marca</label>
                    <select 
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                      value={boxBrand}
                      onChange={e => setBoxBrand(e.target.value)}
                    >
                      <option value="">Seleccione...</option>
                      {dbBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Modelo</label>
                    <select 
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                      value={boxModel}
                      onChange={e => setBoxModel(e.target.value)}
                    >
                      <option value="">Seleccione...</option>
                      {dbModels.filter(m => !boxBrand || m.brand_id === boxBrand).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Cantidad</label>
                    <input 
                      type="number" 
                      placeholder="Ej: 10"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                      value={boxQty}
                      onChange={e => setBoxQty(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-100 border-t border-slate-200 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowCreateBoxModal(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={handleCreateBox} disabled={!boxBrand || !boxModel || !boxQty || !boxTech}>
                  Crear Caja
                </Button>
              </div>
            </Card>
          </div>
        )}

        {showDispatchForm && (
          <Card className="border-2 border-[#2ec4f1]/20 p-0 overflow-hidden animate-rise-in">
            <div className="bg-[#181c3a] p-8 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-3 rounded-2xl">
                  <Package className="w-6 h-6 text-[#2ec4f1]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Configuración de Salida</h2>
                  <p className="text-white/60 text-xs font-medium">Defina el tipo de despacho y escanee las unidades</p>
                </div>
              </div>
              <div className="flex gap-2">
                {(['master_box', 'massive', 'individual'] as const).map(type => (
                  <button 
                    key={type}
                    onClick={() => setDispatchType(type)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${dispatchType === type ? 'bg-[#2ec4f1] text-[#181c3a]' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                  >
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destino / Cliente</label>
                  <input type="text" placeholder="Ej: Bodega Central" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold outline-none focus:border-[#2ec4f1]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transporte / Ruta</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold outline-none">
                    <option>Ruta Norte - Piloto A</option>
                    <option>Ruta Sur - Piloto B</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prioridad</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold outline-none">
                    <option>Normal</option>
                    <option>Urgente (SLA 24h)</option>
                  </select>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <QrCode className="w-5 h-5 text-[#2ec4f1]" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Validación de Salida (Escaneo)</h3>
                  </div>
                  <Badge variant="blue">{itemsToDispatch.length} Items Escaneados</Badge>
                </div>

                <form onSubmit={handleScan} className="flex gap-4">
                  <input 
                    type="text" 
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Escanee Serie o Código de Caja..."
                    className="flex-1 bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 focus:border-[#2ec4f1] outline-none text-lg font-mono font-bold shadow-sm transition-all"
                  />
                  <Button type="submit" className="px-12 rounded-2xl">Validar</Button>
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-8">
                  {itemsToDispatch.map((item, i) => (
                    <div key={i} className="bg-slate-50 p-3 rounded-xl text-[10px] font-mono font-bold flex items-center justify-between group border border-slate-200/50">
                      <span className="truncate">{item}</span>
                      <button onClick={() => setItemsToDispatch(itemsToDispatch.filter((_, idx) => idx !== i))} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    </div>
                  ))}
                  {itemsToDispatch.length === 0 && (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2.5rem] opacity-30">
                      <Boxes className="w-12 h-12 mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">Esperando escaneo de unidades...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-8 border-t border-slate-100">
                <Button variant="outline" onClick={() => setShowDispatchForm(false)}>Descartar</Button>
                <Button variant="primary" className="px-12 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20" disabled={itemsToDispatch.length === 0}>
                  Finalizar y Generar Guía de Salida
                </Button>
              </div>
            </div>
          </Card>
        )}

        <section className="space-y-6">
          <ModuleToolbar 
            onSearch={(v) => console.log(v)}
            addLabel="Nuevo Despacho"
          />

          <Card padding="none" className="overflow-hidden">
            <DataTable
              columns={dispatchColumns}
              data={dispatches}
              getRowId={(disp: DispatchItem) => disp.id}
              onRowClick={(disp: DispatchItem) => handleSelectBox(disp)}
              rowClassName={() => 'group cursor-pointer'}
              rowHeight={64}
              maxBodyHeight={560}
              minWidth={1000}
              headerClassName="bg-slate-50"
              emptyMessage="No hay manifiestos de despacho."
            />
          </Card>
        </section>
        </div>
        ) : (
          <div className="space-y-6 animate-in fade-in">
            <Card padding="none" className="overflow-hidden">
              <DataTable
                columns={dispatchHistoryColumns}
                data={dispatchHistory}
                getRowId={(hist: any) => hist.id}
                rowHeight={64}
                maxBodyHeight={560}
                minWidth={900}
                headerClassName="bg-slate-50"
                emptyMessage="No hay historial de despachos registrados."
              />
            </Card>
          </div>
        )}
      </div>
    </ModulePage>
  );
}
// Force HMR refresh
