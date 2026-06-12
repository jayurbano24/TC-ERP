"use client";

import React, { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { 
  Package, 
  Truck, 
  ClipboardList, 
  Camera, 
  QrCode, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Plus,
  Scan,
  Database,
  Layers,
  Box,
  FileText,
  Search,
  ArrowRightCircle,
  Pencil,
  Trash2,
  ClipboardCheck,
  History,
  ArrowRight,
  AlertTriangle,
  Radio,
  Printer,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
  Barcode,
  X,
  Eye
} from 'lucide-react';
import { getReceptions, createReceptionWithSeries, createPxReceptionWithBoxes, DbReception } from '@/lib/database/receptions';
import { getCarriers, getTechnologies, getBrands, getModels, getPxProviders } from '@/lib/database/config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useEffect, useRef } from 'react';
import BarcodeScanner from '@/components/BarcodeScanner';

// --- DATA ---
const initialManifestItems: any[] = [];
const initialCacRecords: any[] = [];

export default function UnifiedRecepcionPage() {
  const [moduleMode, setModuleMode] = useState<'cac' | 'px'>('cac');
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');

  // --- PX STATE ---
  const [manifestItems, setManifestItems] = useState(initialManifestItems);
  const [scannedSeries, setScannedSeries] = useState<any[]>([]);
  const [currentScans, setCurrentScans] = useState<string[]>(['', '', '', '']);
  const [selectedBoxForScan, setSelectedBoxForScan] = useState<string | null>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [showFindingModal, setShowFindingModal] = useState(false);
  const [guideData, setGuideData] = useState({ sap: '', docReferencia: '', agencia: 'Monte Verdes', proveedorPx: '', guia: '', piloto: '', courier: '' });
  const [currentEntry, setCurrentEntry] = useState({ tecnologia: 'ONT / MODEM', marca: 'Huawei', modelo: 'HG8245H', totalEsperado: 0 });
  const [pxRecords, setPxRecords] = useState<any[]>([]);

  // --- CAC STATE ---
  const [showCacForm, setShowCacForm] = useState(false);
  const [cacRecords, setCacRecords] = useState(initialCacRecords);
  const [cacFormStep, setCacFormStep] = useState<'data' | 'evidence'>('data');
  const [cacScannedItems, setCacScannedItems] = useState<string[]>([]);
  const [cacScanInput, setCacScanInput] = useState('');
  const [cacTotalCajas, setCacTotalCajas] = useState(0);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMarca, setFilterMarca] = useState('Todas');
  const [filterTransportista, setFilterTransportista] = useState('Todos');
  const [filterPilot, setFilterPilot] = useState('Todos');
  const [cacCarrier, setCacCarrier] = useState('');
  const [cacPilot, setCacPilot] = useState('');
  const [cacAgency, setCacAgency] = useState('');
  const [isIndustrialScanning, setIsIndustrialScanning] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cacError, setCacError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTimeline, setShowTimeline] = useState<any | null>(null);
  const [timelineActiveGuide, setTimelineActiveGuide] = useState<string | null>(null);
  const [showPxDetails, setShowPxDetails] = useState<any | null>(null);
  const [pxDetailsSeries, setPxDetailsSeries] = useState<any[]>([]);
  const [transportes, setTransportes] = useState<any[]>([]);
  const [systemTechnologies, setSystemTechnologies] = useState<any[]>([]);
  const [systemBrands, setSystemBrands] = useState<any[]>([]);
  const [systemModels, setSystemModels] = useState<any[]>([]);
  const [systemPxProviders, setSystemPxProviders] = useState<any[]>([]);
  const [currentUserFullName, setCurrentUserFullName] = useState('Admin User');
  const scanInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single();
        if (data && data.full_name) {
          setCurrentUserFullName(data.full_name);
        }
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [techs, brnds, mdls, pxProvs] = await Promise.all([
          getTechnologies(),
          getBrands(),
          getModels(),
          getPxProviders()
        ]);
        setSystemTechnologies(techs);
        setSystemBrands(brnds);
        setSystemModels(mdls);
        setSystemPxProviders(pxProvs);
        
        if (techs.length > 0) setCurrentEntry(prev => ({ ...prev, tecnologia: techs[0].name }));
        if (brnds.length > 0) setCurrentEntry(prev => ({ ...prev, marca: brnds[0].name }));
        if (mdls.length > 0) setCurrentEntry(prev => ({ ...prev, modelo: mdls[0].name }));
        if (pxProvs.length > 0) setGuideData(prev => ({ ...prev, proveedorPx: pxProvs[0].name }));
      } catch (err) {
        console.error("Error fetching system config", err);
      }
    };
    fetchConfig();
  }, []);

  const generateMovId = () => `MOV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // --- PERSISTENCE ---
  useEffect(() => {
    fetchHistory();
  }, [moduleMode]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const [data, carriers] = await Promise.all([
        getReceptions(moduleMode),
        getCarriers()
      ]);
      setTransportes(carriers);
      
      // Adaptamos los datos pero manteniendo el objeto original r para el flatMap
      const adaptedData = data.map((r: any) => ({
        ...r,
        fecha_formateada: new Date(r.created_at).toLocaleString(),
        usuario: r.received_by || 'Admin User',
        pilot_display: r.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---'
      }));
      
      if (moduleMode === 'cac') setCacRecords(adaptedData);
      else setPxRecords(adaptedData);
    } catch (error) {
      console.error("Error fetching history:", error);
      if (moduleMode === 'cac') setCacRecords([]);
      else setPxRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // --- PX HANDLERS ---
  const handleViewPxDetails = async (rec: any) => {
    setShowPxDetails(rec);
    setPxDetailsSeries([]); // reset
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data, error } = await supabase.from('series').select('*, boxes(box_code)').eq('current_reception_id', rec.id);
      if (error) throw error;
      
      const grouped: Record<string, any> = {};
      (data || []).forEach((s: any) => {
        const soId = s.service_order_id || s.serial_number; // agrupar por OS (o SN si no hay OS)
        if (!grouped[soId]) {
          const brand = systemBrands.find(b => b.id === s.brand_id)?.name || '';
          const model = systemModels.find(m => m.id === s.model_id);
          const tech = systemTechnologies.find(t => t.id === model?.technology_id)?.name || '';

          grouped[soId] = {
            series: [],
            material: s.material || '',
            box_code: s.boxes?.box_code || '',
            brand: brand,
            model: model?.name || '',
            technology: tech
          };
        }
        grouped[soId].series.push(s.serial_number);
      });
      
      const formattedData = Object.values(grouped).map(g => ({
        s1: g.series[0] || '-',
        s2: g.series[1] || '-',
        s3: g.series[2] || '-',
        s4: g.series[3] || '-',
        material: g.material,
        box_code: g.box_code,
        brand: g.brand,
        model: g.model,
        technology: g.technology
      }));

      setPxDetailsSeries(formattedData);
    } catch (err: any) {
      console.error("Error fetching series details:", err);
      alert("Error al cargar detalles: " + ((err as any)?.message || JSON.stringify(err)));
    }
  };

  // ─── Validación Global de Series ───────────────────────────────────────────
  // Verifica si una serie ya está en un proceso activo dentro del sistema.
  // Permite re-ingreso únicamente si fue despachada o salió del sistema.
  const checkSerialInSystem = async (serial: string): Promise<{blocked: boolean; info: string}> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { blocked: false, info: '' };

    const { data: existingSeries } = await supabase
      .from('series')
      .select('id, serial_number, current_reception_id, receptions:current_reception_id(guide_number, created_at)')
      .eq('serial_number', serial.toUpperCase())
      .maybeSingle();

    if (!existingSeries) return { blocked: false, info: '' }; // Primera vez en el sistema

    // Buscar la última OS asociada a esta serie
    const { data: latestOS } = await supabase
      .from('service_orders')
      .select('os_label, status, reentry_count')
      .eq('series_id', existingSeries.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Estados que permiten re-ingreso (el equipo ya salió del sistema)
    const exitedStatuses = ['DESPACHADO', 'ENTREGADO', 'SALIDA', 'DEVUELTO'];
    const currentStatus = (latestOS?.status || '').toUpperCase();

    if (!latestOS || !exitedStatuses.some(s => currentStatus.includes(s))) {
      const reception = existingSeries.receptions as any;
      const recGuide = reception?.guide_number || 'N/A';
      const recDate = reception?.created_at ? new Date(reception.created_at).toLocaleDateString() : '';
      const osLabel = latestOS?.os_label || 'NO ASIGNADA (En Bodega/Recepción)';

      return {
        blocked: true,
        info: `🚫 SERIE EN PROCESO ACTIVO\n\nLa serie "${serial}" ya está registrada en el sistema:\n` +
              `📋 Recepción: ${recGuide}${recDate ? ` (${recDate})` : ''}\n` +
              `📦 OS: ${osLabel} — Estado: ${latestOS ? currentStatus : 'ACTIVA'}\n\n` +
              `Solo puede reingresar si fue despachada o salió del sistema.`
      };
    }

    return { blocked: false, info: '' };
  };

  const handleAddSN_PX = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedBoxForScan && manifestItems.length > 0) {
      setSelectedBoxForScan(manifestItems[0].boxCode);
    }

    if (!selectedBoxForScan) {
      alert("Debe agregar al menos una caja antes de escanear");
      return;
    }

    const item = manifestItems.find(i => i.boxCode === selectedBoxForScan);
    if (!item) return;

    const modelConfig = systemModels.find(m => m.name === item.modelo);
    const expectedScans = modelConfig?.series_count || (item.tecnologia === 'EMTA' ? 4 : 1);

    // Get filled inputs up to expectedScans
    const filledScans = currentScans.slice(0, expectedScans).map(s => s.trim());
    
    // Check if there's any empty required input
    const firstEmptyIndex = filledScans.findIndex(s => s === '');
    if (firstEmptyIndex !== -1) {
      document.getElementById(`scan-input-${firstEmptyIndex}`)?.focus();
      return;
    }
    
    const count = scannedSeries.filter(s => s.boxCode === selectedBoxForScan).length;
    if (count >= item.totalEsperado) {
      alert(`Límite alcanzado para la caja ${selectedBoxForScan}`);
      return;
    }
    
    // Check duplicates globally
    const hasDuplicate = filledScans.some(scan => 
      scannedSeries.find(s => s.sn === scan || s.s2 === scan || s.s3 === scan || s.s4 === scan)
    );
    if (hasDuplicate) {
      alert("Una o más series ya fueron escaneadas");
      return;
    }

    // Validar contra el sistema global: la serie no debe estar en proceso activo
    for (const scan of filledScans) {
      const check = await checkSerialInSystem(scan);
      if (check.blocked) {
        alert(check.info);
        return;
      }
    }

    // Add to table
    setScannedSeries([{ 
      sn: filledScans[0], 
      s2: expectedScans > 1 ? filledScans[1] : '',
      s3: expectedScans > 2 ? filledScans[2] : '',
      s4: expectedScans > 3 ? filledScans[3] : '',
      boxCode: selectedBoxForScan,
      modelo: item.modelo, 
      marca: item.marca, 
      tecnologia: item.tecnologia,
      material: item.material || '',
      timestamp: new Date().toLocaleTimeString() 
    }, ...scannedSeries]);

    // Clear and focus first
    setCurrentScans(['', '', '', '']);
    setTimeout(() => {
      document.getElementById(`scan-input-0`)?.focus();
    }, 10);
  };

  // --- CAC HANDLERS ---
  const handleScan_CAC = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const input = cacScanInput.trim().toUpperCase();
    if (!input) return;

    // 1. Validar contra la lista actual en pantalla (rápido, sin DB)
    if (cacScannedItems.includes(input)) {
      setCacError(`⚠️ DUPLICADO: La guía "${input}" ya está en tu lista actual.`);
      setCacScanInput('');
      return;
    }

    // 2. Validar contra el historial en memoria (caché cargada al inicio)
    const inMemoryMatch = cacRecords.find(r => {
      const cleanNotes = (r.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
      const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim().toUpperCase()).filter(Boolean) || [];
      return notesGuias.includes(input);
    });

    if (inMemoryMatch) {
      const fechaRecibida = inMemoryMatch.fecha_formateada || new Date(inMemoryMatch.created_at).toLocaleString();
      setCacError(`🚫 GUÍA DUPLICADA: "${input}" ya fue recibida el ${fechaRecibida}. No se puede agregar nuevamente.`);
      setCacScanInput('');
      return;
    }

    // 3. Consulta en tiempo real a la DB (para detectar duplicados no cargados en caché)
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: dbMatches } = await supabase
        .from('receptions')
        .select('*')
        .eq('source', 'cac')
        .ilike('notes', `%Guías:%${input}%`)
        .limit(10);

      if (dbMatches && dbMatches.length > 0) {
        // Verificar coincidencia exacta (ilike puede traer parciales)
        const exactMatch = dbMatches.find(r => {
          const cleanNotes = (r.notes || '').split('--- LÍNEA DE TIEMPO')[0];
          const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim().toUpperCase()) || [];
          return notesGuias.includes(input);
        });

        if (exactMatch) {
          const fechaRecibida = new Date(exactMatch.created_at).toLocaleString();
          setCacError(`🚫 GUÍA DUPLICADA: "${input}" ya fue recibida el ${fechaRecibida}. No se puede agregar nuevamente.`);
          setCacScanInput('');
          return;
        }
      }
    }

    // 4. Validación de bultos esperados
    if (cacTotalCajas > 0 && cacScannedItems.length >= cacTotalCajas) {
      setCacError(`⚠️ LÍMITE ALCANZADO: Solo se permiten ${cacTotalCajas} bultos para esta recepción.`);
      setCacScanInput('');
      return;
    }

    // ✅ Guía válida — agregar a la lista
    setCacScannedItems([input, ...cacScannedItems]);
    setCacScanInput('');
    setCacError('');
  };

  const handleDeleteCACSeries = (index: number) => {
    const newList = [...cacScannedItems];
    newList.splice(index, 1);
    setCacScannedItems(newList);
  };

  const handleEditCACSeries = (index: number) => {
    const current = cacScannedItems[index];
    const newValue = prompt("Editar Serie (SN):", current);
    if (newValue !== null && newValue.trim() !== "") {
      const newList = [...cacScannedItems];
      newList[index] = newValue.trim();
      setCacScannedItems(newList);
    }
  };

  const handlePrintCAC = (record: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Generar un número de recepción numérico a partir del ID o Timestamp
    const numericId = record.created_at 
      ? new Date(record.created_at).getTime().toString().slice(-8)
      : Math.floor(10000000 + Math.random() * 90000000).toString();

    const operatorName = record.usuario || 'Admin User';
    
    // Extraer datos de las notas
    const pilot = record.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
    const cleanNotes = (record.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
    const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
    const guias = notesGuias.length > 0 ? notesGuias : [record.guide_number];

    const guideRows = guias.map((g: string, i: number) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">${i + 1}</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 14px;">${g}</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">Bulto / Guía CAC</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Conduce de Recepción CAC - ${numericId}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
            .header { border-bottom: 4px solid #181c3a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
            .badge { background: #2ec4f1; color: #181c3a; padding: 4px 12px; border-radius: 6px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
            .card { background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; display: block; }
            .value { font-size: 14px; font-weight: bold; color: #1e293b; }
            h2 { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin: 30px 0 15px 0; border-left: 4px solid #2ec4f1; padding-left: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f8fafc; padding: 12px; text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="badge">Acuse de Recibo - Módulo CAC</div>
              <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Conduce de Recepción</h1>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 900; color: #181c3a; font-size: 18px;">REC-${numericId}</div>
              <div style="font-size: 10px; color: #94a3b8; font-weight: bold;">SISTEMA TC-ERP</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <span class="label">Transportista / Piloto</span>
              <span class="value">${pilot}</span>
            </div>
            <div class="card">
              <span class="label">Empresa Logística</span>
              <span class="value">${record.carrier}</span>
            </div>
            <div class="card">
              <span class="label">Fecha / Hora Recepción</span>
              <span class="value">${record.fecha_formateada || new Date(record.created_at).toLocaleString()}</span>
            </div>
            <div class="card">
              <span class="label">Total Bultos Recibidos</span>
              <span class="value">${guias.length} unidades</span>
            </div>
          </div>

          <h2>Detalle de Guías Capturadas</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Número de Guía</th>
                <th>Tipo de Bulto</th>
              </tr>
            </thead>
            <tbody>
              ${guideRows}
            </tbody>
          </table>

          <div style="margin-top: 80px; display: flex; justify-content: space-around;">
            <div style="text-align: center; width: 220px;">
              <div style="border-top: 1px solid #1e293b; padding-top: 10px;">
                <span class="label">Entrega (Transportista)</span>
                <span style="font-size: 11px; font-weight: bold; color: #181c3a;">${pilot}</span>
              </div>
            </div>
            <div style="text-align: center; width: 220px;">
              <div style="border-top: 1px solid #1e293b; padding-top: 10px;">
                <span class="label">Recibe (Operador Bodega)</span>
                <span style="font-size: 11px; font-weight: bold; color: #181c3a;">${operatorName}</span>
              </div>
            </div>
          </div>

          <div style="margin-top: 40px; text-align: center; font-size: 9px; color: #cbd5e1;">
            Este documento es un comprobante oficial de recepción generado por TC-ERP Logistics.
          </div>

          <script>
            window.onload = function() { 
              window.print(); 
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleFinalizeCAC = async () => {
    if (loading) return;
    if (cacScannedItems.length === 0) {
      alert("Debe escanear al menos una guía o serie.");
      return;
    }
    
    setLoading(true);

    const timestamp = new Date().toLocaleString();
    const movId = generateMovId();

    // Obtener número de recepción secuencial TC (REC-001, REC-002...)
    let recepcionCode = movId; // fallback si el RPC no está disponible
    const supabaseClient = getSupabaseBrowserClient();
    if (supabaseClient) {
      const { data: recCode, error: recErr } = await supabaseClient.rpc('next_cac_reception_code');
      if (!recErr && recCode) recepcionCode = recCode;
    }

    const timelineInfo = `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n[${timestamp}] ${movId} | ${recepcionCode} | RECEPCIÓN: Ingreso inicial al sistema en CAC - Por: ${currentUserFullName}`;

    const dbEntry: DbReception = {
      source: 'cac',
      // Número de recepción TC secuencial (REC-001) como identificador único
      guide_number: recepcionCode,
      carrier: cacCarrier || 'Cargo Express',
      status: 'RECEPCIONADA',
      notes: `Agencia: ${cacAgency || 'CENTRAL DE ATENCIÓN AL CLIENTE (CAC)'}\nPiloto: ${cacPilot || '---'}\nGuías: ${cacScannedItems.join(', ')}${timelineInfo}`,
      received_units: cacScannedItems.length
    };

    const { data, error } = await createReceptionWithSeries(dbEntry, cacScannedItems);

    if (error) {
      alert(`Error al guardar: ${error}`);
      setLoading(false);
      return;
    }

    // Generar Conduce de Recepción Automáticamente
    if (data) {
      handlePrintCAC(data);
    }

    await fetchHistory();
    
    // Resetear formulario
    setCacScannedItems([]);
    setCacScanInput('');
    setIsIndustrialScanning(false);
    setCacPilot('');
    setCacAgency('');
    setCacCarrier('');
    setCacTotalCajas(0);
    
    setLoading(false);
    alert("Recepción CAC finalizada con éxito. Se ha generado el Conduce de Recepción.");
    setActiveTab('history');
  };

  const handleEditHistoryCAC = (id: string, guiaIdx: number) => {
    const record = cacRecords.find(r => r.id === id);
    if (!record) return;
    
    const cleanNotes = (record.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
    const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
    const guias = notesGuias.length > 0 ? notesGuias : [record.guide_number];
    const currentVal = guias[guiaIdx];

    const newVal = prompt("Editar No. Guía:", currentVal);
    if (newVal !== null && newVal.trim() !== "") {
       alert("Actualización de base de datos en preparación...");
       // Aquí iría la lógica de update en Supabase
    }
  };

  const handleDeleteHistoryCAC = async (id: string, guiaIdx: number) => {
    if (!confirm("¿Está seguro de eliminar permanentemente esta recepción y todos sus equipos asociados?")) return;
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      // 1. Obtener cajas y OS asociadas a la recepción
      const { data: boxes } = await supabase.from('boxes').select('id').eq('reception_id', id);
      const boxIds = boxes?.map(b => b.id) || [];
      const { data: os } = await supabase.from('service_orders').select('id').eq('reception_id', id);
      const osIds = os?.map(o => o.id) || [];

      // 2. Eliminar series vinculadas a esas cajas u OS
      if (boxIds.length > 0) {
        await supabase.from('series').delete().in('current_box_id', boxIds);
      }
      if (osIds.length > 0) {
        await supabase.from('series').delete().in('service_order_id', osIds);
      }
      await supabase.from('series').delete().eq('current_reception_id', id);
      
      // 3. Luego eliminamos la recepción en sí
      const { error } = await supabase.from('receptions').delete().eq('id', id);
      
      if (error) throw error;
      
      // Actualizamos el estado local
      setCacRecords(prev => prev.filter(r => r.id !== id));
      alert("✅ Recepción eliminada correctamente del sistema (incluyendo Backoffice).");
    } catch (err: any) {
      alert("❌ Error al eliminar: " + err.message);
    }
  };

  const handleAddCaja = async () => {
    if (!currentEntry.modelo || currentEntry.totalEsperado <= 0) return;
    
    // Obtener código único desde la secuencia de PostgreSQL (atómico, sin condiciones de carrera)
    const supabase = getSupabaseBrowserClient();
    let nextCorrelativo = `BOX-${Date.now().toString().slice(-5)}`; // fallback
    if (supabase) {
      const { data, error } = await supabase.rpc('next_box_code');
      if (!error && data) {
        nextCorrelativo = data;
      } else {
        console.error('Error obteniendo código de caja desde secuencia:', error);
      }
    }

    const newItem = { 
      ...currentEntry, 
      id: Date.now().toString(),
      boxCode: nextCorrelativo,
      material: (currentEntry as any).material || ''
    };
    setManifestItems([...manifestItems, newItem]);
    if (!selectedBoxForScan || manifestItems.length === 0) {
      setSelectedBoxForScan(newItem.boxCode);
    }
    setCurrentEntry({ ...currentEntry, marca: '', modelo: '', totalEsperado: 0, material: '' } as any);
  };

  const printBoxLabel = (box: any) => {
    const printWindow = window.open('', '', 'width=600,height=400');
    if (!printWindow) return;

    const commonStyles = `
      <style>
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; text-align: center; color: #181c3a; }
        .label-container { border: 2px solid #000; padding: 20px; border-radius: 12px; display: inline-block; min-width: 350px; }
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

    const svgLogo = `
      <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" style="height: 45px; width: auto;">
        <rect width="565" height="280" fill="#ffffff"/>
        <g fill="#2e3165"><rect x="8" y="9" width="232" height="60"/><rect x="92" y="9" width="65" height="271"/></g>
        <g fill="#2e3165"><circle cx="425" cy="140" r="140"/><circle cx="425" cy="140" r="85" fill="#ffffff"/><rect x="500" y="100" width="80" height="60" fill="#ffffff"/><circle cx="425" cy="140" r="35" fill="#2e3165"/></g>
      </svg>
    `;

    const simpleLabelHtml = `
      <div class="label-container">
        <div class="title" style="display: flex; justify-content: center; margin-bottom: 15px;">
          ${svgLogo}
        </div>
        <div class="box-id">${box.boxCode}</div>
        
        <!-- Fallback Barcode using font -->
        <div class="barcode">*${box.boxCode}*</div>
        
        <div class="details">
          MARCA: ${box.marca || 'N/A'}<br>
          MODELO: ${box.modelo || 'N/A'}<br>
          CANTIDAD: ${box.totalEsperado} Unidades<br>
          NRO. MATERIAL: ${box.material || '---'}<br>
          FECHA: ${new Date().toLocaleDateString()}
        </div>
      </div>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Impresión de Etiqueta - ${box.boxCode}</title>
          ${commonStyles}
        </head>
        <body>
          ${simpleLabelHtml}
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

  const handlePrintPX = async (record: any) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data: rawSeries } = await supabase
      .from('series')
      .select('*, models(name), brands(name)')
      .eq('current_reception_id', record.id);

    if (!rawSeries || rawSeries.length === 0) {
      alert("No hay series registradas para esta recepción");
      return;
    }

    const boxIds = Array.from(new Set(rawSeries.map((s: any) => s.current_box_id).filter(Boolean)));
    let boxesData: any[] = [];
    if (boxIds.length > 0) {
      const { data } = await supabase.from('boxes').select('*').in('id', boxIds);
      boxesData = data || [];
    }

    const manifest = (boxesData.length > 0 ? boxesData : [{ id: 'mock-box', box_code: 'CAJA-UNICA', capacity: rawSeries.length }]).map(b => ({
       boxCode: b.box_code || b.id,
       totalEsperado: b.capacity || rawSeries.filter((s: any) => s.current_box_id === b.id).length,
       marca: rawSeries.find((s: any) => s.current_box_id === b.id)?.brands?.name || 'N/A',
       modelo: rawSeries.find((s: any) => s.current_box_id === b.id)?.models?.name || 'N/A',
       tecnologia: record.notes?.split('Backoffice_Tech: ')[1]?.split('\\n')[0] || 'EQUIPO'
    }));

    const groupedSeries = rawSeries.reduce((acc: any, s: any) => {
      const key = s.service_order_id || s.serial_number;
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {});

    const series = Object.values(groupedSeries).map((group: any) => {
      group.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const s = group[0];
      return {
        sn: s.serial_number,
        s2: group[1]?.serial_number || '',
        s3: group[2]?.serial_number || '',
        s4: group[3]?.serial_number || '',
        material: s.material || '-',
        marca: s.brands?.name || 'N/A',
        modelo: s.models?.name || 'N/A',
        boxCode: boxesData.find(b => b.id === s.current_box_id)?.box_code || (boxesData.length === 0 ? 'CAJA-UNICA' : s.current_box_id)
      };
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Generamos las tablas por cada caja
    const boxesTables = manifest.map((box: any) => {
      const boxSeries = series.filter((s: any) => s.boxCode === box.boxCode);
      const rows = boxSeries.map((s: any, i: number) => `
        <tr>
          <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 9px; white-space: nowrap;">${i + 1}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 10px; white-space: nowrap;">${s.sn}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; color: #64748b; font-size: 9px; white-space: nowrap;">${s.s2 || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; color: #64748b; font-size: 9px; white-space: nowrap;">${s.s3 || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; color: #64748b; font-size: 9px; white-space: nowrap;">${s.s4 || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 9px; white-space: nowrap;">${s.material || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; color: #64748b; font-size: 9px; white-space: nowrap;">${s.marca}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; color: #64748b; font-size: 9px; white-space: nowrap;">${s.modelo}</td>
        </tr>
      `).join('');

      return `
        <div style="margin-bottom: 30px;">
          <h3 style="font-size: 11px; font-weight: 900; color: #181c3a; text-transform: uppercase; margin-bottom: 5px; background: #f8fafc; padding: 6px; border: 1px solid #e2e8f0; border-radius: 4px;">
            Caja: ${box.boxCode} <span style="color: #64748b;">| ${box.marca} ${box.modelo} (${box.tecnologia})</span> <span style="float: right; color: #2ec4f1;">Total: ${boxSeries.length} / ${box.totalEsperado}</span>
          </h3>
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>S-1</th>
                <th>S-2</th>
                <th>S-3</th>
                <th>S-4</th>
                <th>Material</th>
                <th>Marca</th>
                <th>Modelo</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" style="text-align:center; padding:10px; color:#94a3b8; font-size:9px;">Sin series escaneadas</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Manifiesto PX - ${record.sap}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 20px; color: #1e293b; line-height: 1.4; }
            .header { border-bottom: 2px solid #181c3a; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .badge { background: #2ec4f1; color: #181c3a; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
            .card { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .label { font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; display: block; }
            .value { font-size: 12px; font-weight: bold; color: #1e293b; }
            h2 { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin: 20px 0 10px 0; border-left: 3px solid #2ec4f1; padding-left: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #f8fafc; padding: 8px; text-align: left; font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="badge">Acuse de Recibo - Planta Externa</div>
              <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Manifiesto de Carga</h1>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 900; color: #181c3a; font-size: 18px;">PX-${record.notes?.split('DOC Ref: ')[1]?.split('\n')[0] || record.sap_document}</div>
              <div style="font-size: 10px; color: #94a3b8; font-weight: bold;">SISTEMA TC-ERP</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <span class="label">Número de Pedido</span>
              <span class="value">${record.sap_document}</span>
            </div>
            ${record.notes?.split('DOC Ref: ')[1]?.split('\n')[0] ? `
            <div class="card">
              <span class="label">DOC Referencia</span>
              <span class="value">${record.notes?.split('DOC Ref: ')[1]?.split('\n')[0]}</span>
            </div>
            ` : ''}
            ${record.carrier ? `
            <div class="card">
              <span class="label">Proveedor PX</span>
              <span class="value">${record.carrier}</span>
            </div>
            ` : ''}
            <div class="card">
              <span class="label">Fecha / Hora Recepción</span>
              <span class="value">${record.fecha_formateada}</span>
            </div>
            <div class="card">
              <span class="label">Agencia / Sede</span>
              <span class="value">${record.notes?.split('Agencia: ')[1]?.split('\n')[0] || record.carrier}</span>
            </div>
            <div class="card">
              <span class="label">Total Equipos Recibidos</span>
              <span class="value">${series.length} unidades</span>
            </div>
            <div class="card">
              <span class="label">Total Cajas Recibidas</span>
              <span class="value">${manifest.length} Cajas</span>
            </div>
          </div>

          <h2>Detalle de Cajas y Series</h2>
          ${boxesTables}

          <div style="margin-top: 80px; display: flex; justify-content: space-around;">
            <div style="text-align: center; width: 200px;">
              <div style="border-top: 1px solid #1e293b; padding-top: 10px;">
                <span class="label">Entrega (Transportista)</span>
              </div>
            </div>
            <div style="text-align: center; width: 200px;">
              <div style="border-top: 1px solid #1e293b; padding-top: 10px;">
                <span class="label">Recibe (Bodega PX)</span>
              </div>
            </div>
          </div>

          <div style="margin-top: 40px; text-align: center; font-size: 9px; color: #cbd5e1;">
            Este documento es un comprobante oficial de recepción generado por TC-ERP Logistics.
          </div>

          <script>
            window.onload = function() { 
              window.print(); 
              // window.close(); 
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleFinalizePX = async () => {
    if (loading) return;
    if (manifestItems.length === 0) return alert("Agregue al menos una caja");
    if (scannedSeries.length === 0) return alert("No hay series escaneadas");
    setLoading(true);

    const dbEntry: DbReception = {
      source: 'px',
      guide_number: guideData.guia || `PX-${Date.now().toString().slice(-6)}`,
      sap_document: guideData.sap || 'SIN-PEDIDO',
      carrier: guideData.proveedorPx || 'N/A',
      status: 'CLASIFICADA',
      notes: `DOC Ref: ${guideData.docReferencia || '---'}\nAgencia: ${guideData.proveedorPx}\nProveedor PX: ${guideData.proveedorPx}\nPiloto: ${guideData.piloto || '---'}\nCourier: ${guideData.courier || '---'}\nBackoffice_Tech: ${manifestItems[0]?.tecnologia || ''}\nCajas: ${manifestItems.length}`,
      received_units: scannedSeries.length,
      expected_units: manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0)
    };

    const boxes = manifestItems.map(item => ({
      id: item.id,
      box_code: item.boxCode,
      expected_units: item.totalEsperado,
      brand_id: systemBrands.find(b => b.name === item.marca)?.id || null,
      model_id: systemModels.find(m => m.name === item.modelo)?.id || null,
      material: item.material || null
    }));

    const seriesByBox: Record<string, any[]> = {};
    for (const s of scannedSeries) {
      const box = manifestItems.find(i => i.boxCode === s.boxCode);
      if (box) {
        if (!seriesByBox[box.id]) seriesByBox[box.id] = [];
        // Push the full equipment object so we can link them to one OS
        seriesByBox[box.id].push(s);
      }
    }

    const { data, error } = await createPxReceptionWithBoxes(dbEntry, boxes, seriesByBox);

    if (error) {
      alert(`Error al guardar recepción PX: ${error}`);
      setLoading(false);
      return;
    }

    const newRecord = {
      id: data.id,
      source: 'px',
      guide_number: guideData.guia || `PX-${Date.now().toString().slice(-6)}`,
      status: 'CLASIFICADA',
      created_at: new Date().toISOString(),
      sap_document: guideData.sap || 'SIN-PEDIDO',
      carrier: guideData.proveedorPx || 'N/A',
      notes: `DOC Ref: ${guideData.docReferencia || '---'}\nAgencia: ${guideData.proveedorPx}\nProveedor PX: ${guideData.proveedorPx}\nPiloto: ${guideData.piloto || '---'}\nCourier: ${guideData.courier || '---'}\nBackoffice_Tech: ${manifestItems[0]?.tecnologia || ''}\nCajas: ${manifestItems.length}`,
      received_units: scannedSeries.length,
      expected_units: manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0),
      fecha_formateada: new Date().toLocaleString(),
      usuario: currentUserFullName,
      received_by: currentUserFullName,
      pilot_display: guideData.piloto || '---',
      // Mantenemos también los antiguos por si acaso se usan en handlePrintPX
      sap: guideData.sap || 'SIN-PEDIDO',
      docReferencia: guideData.docReferencia || '',
      agencia: guideData.agencia,
      proveedorPx: guideData.proveedorPx,
      fecha: new Date().toLocaleString(),
      manifest: [...manifestItems],
      series: [...scannedSeries],
      total: scannedSeries.length
    };

    setPxRecords([newRecord, ...pxRecords]);
    handlePrintPX(newRecord);
    
    // Reset state
    setManifestItems([]);
    setScannedSeries([]);
    setGuideData({ sap: '', docReferencia: '', agencia: 'Monte Verdes', proveedorPx: systemPxProviders[0]?.name || '' } as any);
    setLoading(false);

    // Confirmación de ingreso a bodega
    alert(
      `✅ Recepción PX finalizada con éxito.\n\n` +
      `📦 ${manifestItems.length} caja(s) ingresada(s) automáticamente a BODEGA CENTRAL.\n` +
      `🔢 ${scannedSeries.length} equipo(s) registrado(s) con estado: EN BODEGA CENTRAL.\n\n` +
      `Las cajas están disponibles en Bodega → Gestión de Bodega.`
    );
    setActiveTab('history');
  };

  // --- DERIVED CONFIG STATE ---
  const selectedTechObj = systemTechnologies.find(t => t.name === currentEntry.tecnologia);
  const selectedTechId = selectedTechObj?.id;

  const validModelsForTech = systemModels.filter(m => !selectedTechId || m.technology_id === selectedTechId);
  const validBrandIds = new Set(validModelsForTech.map(m => m.brand_id));
  const filteredBrands = systemBrands.filter(b => validBrandIds.has(b.id));

  const selectedBrandObj = systemBrands.find(b => b.name === currentEntry.marca);
  const selectedBrandId = selectedBrandObj?.id;

  const filteredModels = validModelsForTech.filter(m => !selectedBrandId || m.brand_id === selectedBrandId);

  return (
    <ModulePage
      title={moduleMode === 'px' ? "Recepción Planta Externa (PX)" : "Recepción de Carga (CAC)"}
      category="Logística"
      actions={
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setModuleMode('px')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'px' ? 'bg-[#181c3a] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Módulo PX
          </button>
          <button 
            onClick={() => setModuleMode('cac')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'cac' ? 'bg-[#181c3a] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Módulo CAC
          </button>
        </div>
      }
    >
      {/* TABS NAVEGACIÓN */}
      <div className="flex items-center gap-4 mb-8 border-b border-slate-100">
        <button 
          onClick={() => setActiveTab('scan')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'scan' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4" />
            {moduleMode === 'px' ? 'Ingreso de Equipos' : 'Nueva Recepción'}
          </div>
          {activeTab === 'scan' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2ec4f1] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'history' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial / Registros
          </div>
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2ec4f1] rounded-t-full" />}
        </button>
      </div>

      {/* CONTENIDO PX */}
      {moduleMode === 'px' && activeTab === 'scan' && (
        <div className="grid lg:grid-cols-12 gap-8 animate-rise-in">
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
            <Card className="border-l-4 border-l-[#2ec4f1]">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#2ec4f1]" />
                  <h3 className="text-sm font-black uppercase tracking-widest">Datos del Documento</h3>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Número de Pedido</label>
                      <input 
                        type="text" 
                        placeholder="Ej: 8000XXXX"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.sap}
                        onChange={(e) => setGuideData({...guideData, sap: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">DOC Referencia</label>
                      <input 
                        type="text" 
                        placeholder="Ej: REF-1234"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.docReferencia}
                        onChange={(e) => setGuideData({...guideData, docReferencia: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Proveedor PX</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={guideData.proveedorPx}
                      onChange={(e) => setGuideData({...guideData, proveedorPx: e.target.value})}
                    >
                      {systemPxProviders.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">No. Guía (Opcional)</label>
                      <input 
                        type="text" 
                        placeholder="Autogenerado"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.guia}
                        onChange={(e) => setGuideData({...guideData, guia: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Piloto (Opcional)</label>
                      <input 
                        type="text" 
                        placeholder="Nombre"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.piloto}
                        onChange={(e) => setGuideData({...guideData, piloto: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Courier (Opcional)</label>
                    <input 
                      type="text" 
                      placeholder="Empresa Courier"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={guideData.courier}
                      onChange={(e) => setGuideData({...guideData, courier: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.tecnologia}
                      onChange={(e) => setCurrentEntry({...currentEntry, tecnologia: e.target.value, marca: '', modelo: ''})}
                    >
                      <option value="">Seleccione...</option>
                      {systemTechnologies.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Marca</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={currentEntry.marca}
                        onChange={(e) => setCurrentEntry({...currentEntry, marca: e.target.value, modelo: ''})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredBrands.map(b => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Modelo</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={currentEntry.modelo}
                        onChange={(e) => setCurrentEntry({...currentEntry, modelo: e.target.value})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredModels.map(m => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cantidad Esperada</label>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="Ej: 50"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.totalEsperado || ''}
                      onChange={(e) => setCurrentEntry({...currentEntry, totalEsperado: parseInt(e.target.value) || 0})}
                    />
                  </div>

                  <Button 
                    variant="outline" 
                    onClick={handleAddCaja}
                    className="w-full border-dashed h-12 text-[10px] uppercase font-black tracking-widest hover:bg-[#2ec4f1]/5 hover:border-[#2ec4f1] transition-all"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Crear Caja
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="bg-white border-2 border-slate-100 shadow-xl overflow-hidden">
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Control de Cajas</h3>
                  <Badge variant="blue" className="bg-[#2ec4f1]/10 text-[#2ec4f1] border-none font-black">{manifestItems.length} Cajas</Badge>
                </div>
                
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {manifestItems.map(item => {
                    const received = scannedSeries.filter(s => s.boxCode === item.boxCode).length;
                    const pending = item.totalEsperado - received;
                    const isComplete = received >= item.totalEsperado && item.totalEsperado > 0;
                    const isSelected = selectedBoxForScan === item.boxCode;

                    return (
                      <div 
                        key={item.id} 
                        onClick={() => setSelectedBoxForScan(item.boxCode)}
                        className={`group relative py-4 px-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-all rounded-xl cursor-pointer ${isSelected ? 'bg-slate-100 ring-2 ring-[#2ec4f1]/50 ring-inset shadow-inner' : ''}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black uppercase tracking-tighter ${isSelected ? 'text-[#2ec4f1]' : 'text-slate-400'}`}>Caja: {item.boxCode}</span>
                              {isComplete && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#2ec4f1] animate-pulse" />}
                            </div>
                            <h4 className="text-sm font-black text-[#181c3a] leading-none">{item.marca} {item.modelo}</h4>
                            <span className="text-[9px] font-bold text-[#2ec4f1] uppercase">{item.tecnologia}</span>
                          </div>
                          
                          <div className="text-right">
                            <div className="flex items-baseline justify-end gap-1">
                              <span className={`text-xl font-black ${isComplete ? 'text-emerald-500' : 'text-[#2ec4f1]'}`}>{received}</span>
                              <span className="text-[10px] font-bold text-slate-300">/ {item.totalEsperado}</span>
                            </div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                              {isComplete ? 'Completado' : `Faltan: ${pending}`}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="text" 
                            placeholder="Nro. de Material" 
                            className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-[10px] font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                            value={item.material || ''}
                            onChange={(e) => {
                              const newItems = [...manifestItems];
                              const index = newItems.findIndex(i => i.id === item.id);
                              if (index !== -1) {
                                newItems[index].material = e.target.value;
                                setManifestItems(newItems);
                              }
                            }}
                          />
                        </div>
                        
                        <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              printBoxLabel(item);
                            }}
                            className="p-2 hover:text-[#2ec4f1] transition-all bg-white shadow-md rounded-full border border-slate-100"
                            title="Imprimir Etiqueta"
                          >
                            <Printer size={12} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const newQty = prompt("Nueva cantidad esperada:", item.totalEsperado.toString());
                              if (newQty && !isNaN(parseInt(newQty))) {
                                setManifestItems(manifestItems.map(i => i.id === item.id ? { ...i, totalEsperado: parseInt(newQty) } : i));
                              }
                            }}
                            className="p-2 hover:text-[#2ec4f1] transition-all bg-white shadow-md rounded-full border border-slate-100"
                          >
                            <Pencil size={12} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setManifestItems(manifestItems.filter(i => i.id !== item.id));
                            }}
                            className="p-2 hover:text-rose-500 transition-all bg-white shadow-md rounded-full border border-slate-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {manifestItems.length === 0 && (
                    <div className="py-12 text-center">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Box className="w-6 h-6 text-slate-200" />
                      </div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin cajas creadadas</p>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  {manifestItems.length > 0 && scannedSeries.length < manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0) && (
                    <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-500 rounded-xl p-3 flex items-center justify-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-widest">
                        Faltan {manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0) - scannedSeries.length} equipos para cuadrar la hoja de entrega.
                      </span>
                    </div>
                  )}
                  <Button 
                    variant="primary" 
                    onClick={handleFinalizePX}
                    disabled={scannedSeries.length === 0 || scannedSeries.length !== manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0)}
                    className="w-full bg-[#181c3a] hover:bg-[#252b57] text-white h-14 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-[#181c3a]/10 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirmar y Finalizar Recepción
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className={`lg:col-span-8 xl:col-span-9 transition-all duration-300 ${manifestItems.length === 0 ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              {/* IZQUIERDA: Escáner y Progreso */}
              <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6">
                <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                  <div className="mb-6">
                    <h3 className="text-[13px] font-black text-[#181c3a] uppercase tracking-widest">Escáner de Series</h3>
                  </div>
                  <form onSubmit={handleAddSN_PX} className="flex flex-col gap-5">
                    {(() => {
                      const box = manifestItems.find(i => i.boxCode === selectedBoxForScan);
                      const expectedScans = box ? (systemModels.find(m => m.name === box.modelo)?.series_count || (box.tecnologia === 'EMTA' ? 4 : 1)) : 1;
                      
                      return (
                        <div className="flex flex-col gap-4">
                          {Array.from({ length: expectedScans }).map((_, idx) => (
                            <div key={idx} className="space-y-2">
                              <label className="text-[10px] font-black uppercase text-slate-400">Serie {idx + 1} *</label>
                              <input 
                                id={`scan-input-${idx}`}
                                type="text" 
                                value={currentScans[idx]}
                                onChange={(e) => {
                                  const newScans = [...currentScans];
                                  newScans[idx] = e.target.value;
                                  setCurrentScans(newScans);
                                }}
                                placeholder={`Escanear Serie ${idx + 1}...`}
                                className="w-full h-12 px-4 bg-white border-2 border-slate-200 rounded-lg text-sm font-mono font-bold outline-none focus:border-[#2ec4f1] transition-colors shadow-inner"
                                autoFocus={idx === 0}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <Button type="submit" className="w-full h-12 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase tracking-widest font-black rounded-lg mt-2 shadow-lg shadow-[#181c3a]/20">
                      Registrar Equipo (Enter)
                    </Button>
                  </form>
                </Card>

                {(() => {
                  const box = manifestItems.find(i => i.boxCode === selectedBoxForScan);
                  const expected = box ? box.totalEsperado : 0;
                  const received = scannedSeries.filter(s => s.boxCode === selectedBoxForScan).length;
                  const progressPct = expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0;
                  return (
                    <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                      <div className="mb-4">
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Progreso de la Caja</h3>
                      </div>
                      <div className="flex items-end gap-2 mb-4">
                        <span className="text-3xl font-black text-[#181c3a] leading-none">{received}</span>
                        <span className="text-xs font-bold text-slate-400 mb-1">/ {expected} equipos</span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#181c3a] transition-all duration-500 ease-out" 
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </Card>
                  );
                })()}
              </div>

              {/* DERECHA: Tabla Contenido de Caja */}
              <div className="lg:col-span-8 xl:col-span-9">
                <Card padding="none" className="overflow-hidden h-full border-2 border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
                  <div className="bg-white border-b border-slate-100 p-5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest">Contenido de la Caja</h3>
                    </div>
                  </div>
                  <div className="overflow-x-auto flex-1 bg-white">
                    {(() => {
                      const box = manifestItems.find(i => i.boxCode === selectedBoxForScan);
                      const showMulti = box && (systemModels.find(m => m.name === box.modelo)?.series_count > 1 || box.tecnologia === 'EMTA');
                      return (
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead>
                            <tr className="bg-slate-50/80 border-b text-[10px] font-black uppercase text-slate-400">
                              <th className="px-6 py-4">S-1</th>
                              {showMulti && (
                                <>
                                  <th className="px-6 py-4">S-2</th>
                                  <th className="px-6 py-4">S-3</th>
                                  <th className="px-6 py-4">S-4</th>
                                </>
                              )}
                              <th className="px-6 py-4">Nro Material</th>
                              <th className="px-6 py-4">Caja</th>
                              <th className="px-6 py-4 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {scannedSeries.filter(s => s.boxCode === selectedBoxForScan).length === 0 && (
                              <tr>
                                <td colSpan={showMulti ? 7 : 4} className="px-6 py-16 text-center">
                                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Scan className="w-6 h-6 text-slate-200" />
                                  </div>
                                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                    {selectedBoxForScan ? `Sin series para ${selectedBoxForScan}` : 'Seleccione una caja para ver sus series'}
                                  </p>
                                </td>
                              </tr>
                            )}
                            {scannedSeries
                              .filter(s => s.boxCode === selectedBoxForScan)
                              .map(s => (
                              <tr key={s.sn} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-mono font-black text-[#181c3a]">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {s.sn}
                                  </div>
                                </td>
                                {showMulti && (
                                  <>
                                    <td className="px-6 py-4 font-mono text-slate-500">{s.s2 || '-'}</td>
                                    <td className="px-6 py-4 font-mono text-slate-500">{s.s3 || '-'}</td>
                                    <td className="px-6 py-4 font-mono text-slate-500">{s.s4 || '-'}</td>
                                  </>
                                )}
                                <td className="px-6 py-4 font-mono font-bold text-slate-500">{s.material || '-'}</td>
                                <td className="px-6 py-4 font-bold text-[#2ec4f1] text-[10px]">{s.boxCode}</td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button 
                                      onClick={() => {
                                        const newVal = prompt("Editar Serie 1:", s.sn);
                                        if (newVal && newVal.trim() !== '') {
                                          setScannedSeries(scannedSeries.map(x => x.sn === s.sn ? { ...x, sn: newVal.trim() } : x));
                                        }
                                      }}
                                      className="p-1.5 hover:bg-[#2ec4f1]/10 rounded-lg group transition-colors"
                                      title="Editar Serie"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#2ec4f1]" />
                                    </button>
                                    <button 
                                      onClick={() => setScannedSeries(scannedSeries.filter(x => x.sn !== s.sn))}
                                      className="p-1.5 hover:bg-rose-50 rounded-lg group transition-colors"
                                      title="Eliminar Equipo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-rose-500" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO CAC */}
      {moduleMode === 'cac' && activeTab === 'scan' && (
        <div className="space-y-6 animate-rise-in">
          <Card className="p-0 overflow-hidden border-2 border-[#2ec4f1]/20 shadow-2xl rounded-3xl bg-white">
            <div className="bg-[#181c3a] p-8 text-white flex justify-between items-center border-b-4 border-[#2ec4f1]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#2ec4f1]/20 flex items-center justify-center text-[#2ec4f1]">
                  <Truck size={24} />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight">Nueva Recepción de Carga (CAC)</h2>
              </div>
            </div>
            <div className="p-10 space-y-12">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="w-8 h-8 rounded-full bg-[#181c3a] text-white flex items-center justify-center font-black text-xs">1</div>
                  <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest">Paso 1: Encabezado de Recepción (Formulario)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 ml-1">Agencia Origen</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nombre Agencia"
                        value={cacAgency}
                        onChange={e => setCacAgency(e.target.value)}
                        className={`flex-1 h-14 px-6 bg-slate-50 border-2 rounded-2xl font-bold text-sm text-[#181c3a] outline-none transition-all shadow-sm ${!cacAgency ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 focus:border-[#2ec4f1] focus:bg-white'}`}
                      />
                    </div>
                    {!cacAgency && <p className="text-[8px] font-black text-rose-500 uppercase mt-2 ml-1">Campo Requerido</p>}
                  </div>

                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 ml-1">Transportista / Piloto</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nombre Piloto"
                        value={cacPilot}
                        onChange={e => setCacPilot(e.target.value)}
                        className={`flex-1 h-14 px-6 bg-slate-50 border-2 rounded-2xl font-bold text-sm text-[#181c3a] outline-none transition-all shadow-sm ${!cacPilot ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 focus:border-[#2ec4f1] focus:bg-white'}`}
                      />
                    </div>
                    {!cacPilot && <p className="text-[8px] font-black text-rose-500 uppercase mt-2 ml-1">Campo Requerido</p>}
                  </div>

                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 ml-1">Empresa Logística</label>
                    <div className="flex gap-2">
                      <select
                        value={cacCarrier}
                        onChange={e => setCacCarrier(e.target.value)}
                        className={`flex-1 h-14 px-6 bg-slate-50 border-2 rounded-2xl font-bold text-sm text-[#181c3a] outline-none transition-all shadow-sm appearance-none ${!cacCarrier ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 focus:border-[#2ec4f1] focus:bg-white'}`}
                      >
                        <option value="">Seleccionar...</option>
                        {transportes.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <button className="w-14 h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-[#181c3a]">+</button>
                    </div>
                    {!cacCarrier && <p className="text-[8px] font-black text-rose-500 uppercase mt-2 ml-1">Campo Requerido</p>}
                  </div>

                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 ml-1">Total Bultos</label>
                    <input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={cacTotalCajas || ''}
                      onChange={e => setCacTotalCajas(parseInt(e.target.value) || 0)}
                      className={`w-full h-14 px-6 bg-slate-50 border-2 rounded-2xl font-bold text-sm text-[#181c3a] outline-none transition-all shadow-sm text-center ${cacTotalCajas < 1 ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 focus:border-[#2ec4f1] focus:bg-white'}`}
                    />
                    {cacTotalCajas < 1 && <p className="text-[8px] font-black text-rose-500 uppercase mt-2 ml-1 animate-pulse">Requerido para iniciar</p>}
                  </div>

                  <div className="md:col-span-1">
                    <button 
                      disabled={!cacPilot || !cacAgency || !cacCarrier || cacTotalCajas < 1}
                      onClick={() => {
                        setIsIndustrialScanning(!isIndustrialScanning);
                        if (!isIndustrialScanning) {
                          setTimeout(() => scanInputRef.current?.focus(), 100);
                        }
                      }}
                      className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg 
                        ${(!cacPilot || !cacAgency || !cacCarrier || cacTotalCajas < 1) 
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none opacity-50' 
                          : isIndustrialScanning 
                            ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                            : 'bg-[#181c3a] text-white hover:bg-[#2ec4f1] hover:text-[#181c3a] shadow-[#181c3a]/10'
                        }`}
                    >
                      <Barcode size={18} /> {isIndustrialScanning && cacTotalCajas > 0 ? 'PISTOLEO ACTIVO' : 'INICIAR PISTOLEO'}
                    </button>
                  </div>
                </div>
              </div>
              <div className={`space-y-8 pb-10 transition-all duration-500 ${!isIndustrialScanning ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2ec4f1] text-[#181c3a] flex items-center justify-center font-black text-xs">2</div>
                    <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest">Paso 2: Área de "Pistoleo" Masivo (Escaneo)</h3>
                  </div>
                  {cacTotalCajas > 0 && (
                    <Badge className="bg-[#2ec4f1]/10 text-[#181c3a] border-none font-black text-xs px-4 py-2">
                      {cacScannedItems.length} {'/'} {cacTotalCajas} BULTOS CAPTURADOS
                    </Badge>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${isIndustrialScanning ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Escaneo Industrial Activo</p>
                  </div>
                  <form onSubmit={handleScan_CAC} className="flex gap-2 w-full">
                    <div className="relative flex-1">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300">
                        <QrCode size={24} />
                      </div>
                      <input
                        ref={scanInputRef}
                        disabled={!isIndustrialScanning || cacTotalCajas < 1}
                        type="text"
                        placeholder={cacTotalCajas < 1 ? "INGRESE TOTAL BULTOS..." : "ESCANEE AQUÍ (Automático)..."}
                        value={cacScanInput}
                        onChange={e => { setCacScanInput(e.target.value); setCacError(''); }}
                        className={`w-full h-20 pl-16 pr-8 bg-white border-2 rounded-3xl font-black text-xl text-[#181c3a] outline-none transition-all shadow-xl shadow-blue-500/5 placeholder:font-bold placeholder:text-slate-300 uppercase ${cacTotalCajas < 1 ? 'border-rose-100 bg-rose-50/30' : 'border-[#2ec4f1]/20 focus:border-[#2ec4f1]'}`}
                      />
                    </div>
                    
                    <Button 
                      variant="outline" 
                      type="button"
                      onClick={() => setIsCameraScannerOpen(true)}
                      disabled={!isIndustrialScanning || cacTotalCajas < 1}
                      className="h-20 px-6 border-2 border-[#2ec4f1]/20 text-[#2ec4f1] rounded-3xl font-black hover:bg-[#2ec4f1] hover:text-[#181c3a] transition-all shadow-xl disabled:opacity-30 bg-white flex flex-col items-center justify-center gap-1"
                      title="Escanear con Cámara"
                    >
                      <Camera size={24} />
                      <span className="text-[9px] uppercase tracking-widest">Cámara</span>
                    </Button>

                    <Button 
                      variant="primary" 
                      type="submit"
                      disabled={!isIndustrialScanning || cacTotalCajas < 1}
                      className="h-20 px-12 bg-[#181c3a] text-white rounded-3xl font-black uppercase tracking-widest text-sm hover:bg-[#2ec4f1] hover:text-[#181c3a] transition-all shadow-xl disabled:opacity-30"
                    >
                      Añadir
                    </Button>
                  </form>
                  
                  {isCameraScannerOpen && (
                    <BarcodeScanner 
                      onClose={() => setIsCameraScannerOpen(false)}
                      onScanSuccess={(decodedText) => {
                        const newSn = decodedText.trim().toUpperCase();
                        if (newSn && !cacScannedItems.includes(newSn)) {
                           setCacScannedItems(prev => [newSn, ...prev]);
                           setCacError('');
                        } else {
                           setCacError(`La serie ${newSn} ya fue escaneada o es inválida.`);
                        }
                      }}
                    />
                  )}

                  {cacError && (
                    <p className="text-xs font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-6 py-3 rounded-2xl border border-rose-100 inline-block animate-shake">{cacError}</p>
                  )}

                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Series Capturadas ({cacScannedItems.length})</p>
                      <button onClick={() => setCacScannedItems([])} className="text-[8px] font-black uppercase text-rose-400 hover:text-rose-600 tracking-tighter">Limpiar Lista</button>
                    </div>
                    
                    <div className="bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 p-8 min-h-[200px] relative shadow-inner">
                      {cacScannedItems.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-200 pointer-events-none">
                          <Barcode size={48} className="mb-4 opacity-20" />
                          <p className="text-xs font-black uppercase tracking-widest opacity-40">Esperando Escaneo...</p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {cacScannedItems.map((g, i) => (
                            <div key={i} className="bg-[#181c3a] text-white border border-[#2ec4f1]/30 rounded-xl px-5 py-3 flex items-center justify-between gap-4 group animate-rise-in shadow-lg">
                              <div className="flex flex-col">
                                <span className="text-[#2ec4f1] text-[8px] font-black mb-0.5">#{cacScannedItems.length - i}</span>
                                <span className="text-xs font-mono font-black">{g}</span>
                              </div>
                              <div className="flex items-center gap-1 border-l border-white/10 pl-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEditCACSeries(i)} className="p-1 hover:bg-[#2ec4f1]/20 rounded text-[#2ec4f1] transition-colors"><Pencil size={12} /></button>
                                <button onClick={() => handleDeleteCACSeries(i)} className="p-1 hover:bg-rose-500/20 rounded text-rose-400 transition-colors"><Trash2 size={12} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if(confirm("¿Seguro que desea cancelar la recepción actual?")) {
                        setIsIndustrialScanning(false);
                        setCacScannedItems([]);
                        setCacError('');
                      }
                    }}
                    className="h-14 px-10 rounded-2xl border-2 border-slate-100 font-black text-xs uppercase text-slate-400 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleFinalizeCAC}
                    disabled={cacScannedItems.length === 0 || loading}
                    className={`h-14 px-12 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl ${cacScannedItems.length >= cacTotalCajas && cacTotalCajas > 0 ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-[#181c3a] text-white hover:bg-[#2ec4f1] hover:text-[#181c3a]'}`}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Finalizar y Registrar Recepción
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-rise-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-[#181c3a]">Historial de Recepciones ({moduleMode.toUpperCase()})</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Registros consolidados de auditoría</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" leftIcon={<Download size={14} />}>Exportar Reporte</Button>
            </div>
          </div>

          {/* PANEL DE MÉTRICAS HOY */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 border-l-4 border-l-[#2ec4f1] bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-xl text-[#2ec4f1]"><ClipboardList size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Guías Hoy</p>
                  <h4 className="text-2xl font-black text-[#181c3a]">
                    {cacRecords
                      .filter(r => r.fecha_formateada?.includes(new Date().toLocaleDateString()))
                      .reduce((acc, r) => {
                        const cleanNotes = (r.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
                        const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
                        return acc + (notesGuias.length > 0 ? notesGuias.length : 1);
                      }, 0)}
                  </h4>
                </div>
              </div>
            </Card>
            <Card className="p-6 border-l-4 border-l-emerald-500 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-50 p-3 rounded-xl text-emerald-500"><Scan size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Equipos Hoy</p>
                  <h4 className="text-2xl font-black text-[#181c3a]">
                    {cacRecords
                      .filter(r => r.fecha_formateada?.includes(new Date().toLocaleDateString()))
                      .reduce((acc, r) => acc + (r.received_units || 0), 0)}
                  </h4>
                </div>
              </div>
            </Card>
            <Card className="p-6 border-l-4 border-l-amber-500 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-amber-50 p-3 rounded-xl text-amber-500"><Clock size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">En Espera (Backoffice)</p>
                  <h4 className="text-2xl font-black text-[#181c3a]">
                    {cacRecords
                      .filter(r => r.status === 'RECEPCIONADA' || r.status === 'PENDIENTE DE CLASIFICAR')
                      .reduce((acc, r) => {
                        const cleanNotes = (r.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
                        const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
                        return acc + (notesGuias.length > 0 ? notesGuias.length : 1);
                      }, 0)}
                  </h4>
                </div>
              </div>
            </Card>
          </div>

          {/* BARRA DE BÚSQUEDA Y FILTROS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2ec4f1] transition-colors" />
              <input 
                type="text" 
                placeholder={moduleMode === 'cac' ? "Buscar por No. Guía o Piloto..." : "Buscar por SAP, Agencia o Usuario..."}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-[#2ec4f1] transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="relative">
              <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black uppercase outline-none focus:border-[#2ec4f1] appearance-none"
                value={filterPilot}
                onChange={(e) => setFilterPilot(e.target.value)}
              >
                <option value="Todos">{moduleMode === 'cac' ? 'Todos los Pilotos' : 'Todas las Agencias'}</option>
                {Array.from(new Set(
                  moduleMode === 'cac' 
                    ? cacRecords.map(r => r.notes?.split('Piloto: ')[1]?.split('\\n')[0]).filter(Boolean)
                    : pxRecords.map(r => r.carrier).filter(Boolean)
                )).map(option => (
                  <option key={option as string} value={option as string}>{option as string}</option>
                ))}
              </select>
            </div>
          </div>

          {moduleMode === 'px' ? (
            <Card padding="none" className="overflow-x-auto custom-scrollbar border-none shadow-xl">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#181c3a] text-white/40 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Fecha / Hora</th>
                    <th className="px-6 py-4">Documento SAP</th>
                    <th className="px-6 py-4">Nombre Agencia PX</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4 text-center">Cant. Cajas</th>
                    <th className="px-6 py-4 text-center">Cantidad Equipos</th>
                    <th className="px-6 py-4">Estatus</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pxRecords
                    .filter(rec => {
                      const searchLower = searchTerm.toLowerCase();
                      const matchSearch = !searchTerm || 
                        (rec.sap_document || '').toLowerCase().includes(searchLower) ||
                        (rec.carrier || '').toLowerCase().includes(searchLower) ||
                        (rec.received_by || 'Admin User').toLowerCase().includes(searchLower);
                      const matchFilter = filterPilot === 'Todos' || rec.carrier === filterPilot;
                      const notEliminated = rec.status !== 'ELIMINADO POR BODEGA';
                      return matchSearch && matchFilter && notEliminated;
                    })
                    .map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-5 font-bold text-slate-600 text-xs">{rec.fecha_formateada || new Date(rec.created_at).toLocaleString()}</td>
                      <td className="px-6 py-5 font-mono font-black text-[#181c3a]">{rec.sap_document || '---'}</td>
                      <td className="px-6 py-5 text-xs font-bold text-slate-500">{rec.carrier || '---'}</td>
                      <td className="px-6 py-5 text-xs font-bold text-slate-500">{rec.received_by || 'Admin User'}</td>
                      <td className="px-6 py-5 text-center font-black text-slate-800">{rec.notes?.match(/Cajas:\s*(\d+)/)?.[1] || 1} Cajas</td>
                      <td className="px-6 py-5 text-center font-black text-slate-800">{rec.received_units || 0} Equipos</td>
                      <td className="px-6 py-5">
                        <Badge variant={rec.status === 'ELIMINADO POR BODEGA' ? 'red' : 'green'} className={`border-none font-black text-[9px] ${rec.status === 'ELIMINADO POR BODEGA' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {rec.status === 'ELIMINADO POR BODEGA' ? 'ELIMINADO POR BODEGA' : 'FINALIZADO'}
                        </Badge>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-4 transition-opacity">
                          <button className="text-slate-400 hover:text-indigo-500 transition-all hover:scale-110" title="Ver Detalle" onClick={(e) => {
                            e.stopPropagation();
                            handleViewPxDetails(rec);
                          }}>
                            <Eye size={22} strokeWidth={2} />
                          </button>
                          <button className="text-slate-400 hover:text-amber-500 transition-all hover:scale-110" title="Editar Documento SAP" onClick={async (e) => {
                            e.stopPropagation();
                            const newSap = prompt("Editar Documento SAP:", rec.sap_document || '');
                            if (newSap === null || newSap.trim() === '' || newSap.trim() === rec.sap_document) return;
                            try {
                              const supabase = getSupabaseBrowserClient();
                              if (!supabase) return;
                              const { error } = await supabase.from('receptions').update({ sap_document: newSap.trim() }).eq('id', rec.id);
                              if (error) throw error;
                              setPxRecords(prev => prev.map(r => r.id === rec.id ? { ...r, sap_document: newSap.trim() } : r));
                            } catch (err: any) {
                              alert("Error al actualizar: " + err.message);
                            }
                          }}>
                            <Pencil size={22} strokeWidth={2} />
                          </button>
                          <button className="text-slate-400 hover:text-[#2ec4f1] transition-all hover:scale-110" title="Imprimir" onClick={(e) => {
                            e.stopPropagation();
                            handlePrintPX(rec);
                          }}>
                            <Printer size={22} strokeWidth={2} />
                          </button>
                          <button className="text-slate-400 hover:text-rose-500 transition-all hover:scale-110" title="Eliminar Recepción" onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`¿Está seguro de ELIMINAR PERMANENTEMENTE la recepción con Documento SAP: ${rec.sap_document || 'S/N'} y todos sus equipos asociados?`)) return;
                            try {
                              const supabase = getSupabaseBrowserClient();
                              if (!supabase) return;
                              // 1. Obtener cajas y OS asociadas a la recepción
                              const { data: boxes } = await supabase.from('boxes').select('id').eq('reception_id', rec.id);
                              const boxIds = boxes?.map(b => b.id) || [];
                              const { data: os } = await supabase.from('service_orders').select('id').eq('reception_id', rec.id);
                              const osIds = os?.map(o => o.id) || [];

                              // 2. Eliminar series vinculadas a esas cajas u OS
                              if (boxIds.length > 0) {
                                await supabase.from('series').delete().in('current_box_id', boxIds);
                              }
                              if (osIds.length > 0) {
                                await supabase.from('series').delete().in('service_order_id', osIds);
                              }
                              await supabase.from('series').delete().eq('current_reception_id', rec.id);
                              
                              // 3. Luego eliminamos la recepción en sí
                              const { error } = await supabase.from('receptions').delete().eq('id', rec.id);
                              
                              if (error) throw error;
                              setPxRecords(prev => prev.filter(r => r.id !== rec.id));
                            } catch (err: any) {
                              alert("Error al eliminar: " + err.message);
                            }
                          }}>
                            <Trash2 size={22} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pxRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-300 italic text-[10px] font-bold uppercase tracking-widest">
                        No hay recepciones PX finalizadas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Mostrando 1-10 de {pxRecords.length} registros</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><ChevronLeft size={14} /></Button>
                  <Button variant="primary" size="sm" className="h-8 w-8 p-0 bg-[#181c3a] text-white">1</Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">2</Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><ChevronRight size={14} /></Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden border-none shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#181c3a] text-white font-black uppercase tracking-[0.1em] text-[11px]">
                    <tr>
                      <th className="px-6 py-5 whitespace-nowrap">Fecha / Hora</th>
                      <th className="px-6 py-5 whitespace-nowrap">No. Recepción TC</th>
                      <th className="px-6 py-5 whitespace-nowrap">Piloto</th>
                      <th className="px-6 py-5 whitespace-nowrap">Recibió</th>
                      <th className="px-6 py-5 whitespace-nowrap">Estatus</th>
                      <th className="px-6 py-5 whitespace-nowrap text-center">Unidades</th>
                      <th className="px-6 py-5 whitespace-nowrap text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cacRecords
                      .map((record: any) => {
                        // Extraer guías del campo 'notes' (fuente de verdad)
                        const rawNotes = record.notes || '';
                        const cleanNotesForGuias = rawNotes
                          .split('--- LÍNEA DE TIEMPO')[0]
                          .split('Backoffice_')[0]
                          .split('Guías Procesadas:')[0];
                        const allGuias = cleanNotesForGuias?.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
                        return { ...record, allGuias };
                      })
                      .filter(item => {
                        const searchLower = searchTerm.toLowerCase();
                        const matchesSearch = !searchTerm ||
                          item.allGuias.some((g: string) => g.toLowerCase().includes(searchLower)) ||
                          item.guide_number?.toLowerCase().includes(searchLower) ||
                          (item.pilot_display && item.pilot_display.toLowerCase().includes(searchLower));
                        const matchesPilot = filterPilot === 'Todos' || item.pilot_display === filterPilot;
                        return matchesSearch && matchesPilot;
                      })
                      .map((item: any) => (
                        <tr key={item.id} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 group">
                          <td className="px-6 py-4 font-bold text-slate-800 text-xs whitespace-nowrap">{item.fecha_formateada}</td>
                          <td className="px-6 py-4">
                            {/* Número de recepción TC (guía madre) */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-black text-[#2ec4f1] text-sm tracking-wide">{item.guide_number}</span>
                            </div>
                            {/* Guías de transporte asociadas */}
                            {item.allGuias.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.allGuias.map((g: string, i: number) => (
                                  <button 
                                    key={i} 
                                    onClick={() => { setShowTimeline(item); setTimelineActiveGuide(g); }}
                                    className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-[#181c3a] px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                    title={`Ver trazabilidad de la guía ${g}`}
                                  >
                                    {g}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-800 text-xs uppercase">{item.pilot_display}</td>
                          <td className="px-6 py-4 font-black text-slate-700 text-xs">{item.usuario}</td>
                          <td className="px-6 py-4">
                            {(() => {
                              const notes = item.notes?.toLowerCase() || '';
                              const status = item.status || '';
                              
                              let label = (status === 'RECEPCIONADA' || status === 'PENDIENTE DE CLASIFICAR') ? 'EN BACKOFFICE' : (status === 'CLASIFICADA' ? 'CLASIFICADA' : status);
                              let colorClass = 'bg-blue-50 text-blue-600';
                              
                              // TRAZABILIDAD ULTRA-ESTRICTA: Solo etiquetas oficiales
                              if (notes.includes('backoffice_category: accesorio')) {
                                label = 'BODEGA: ACCESORIOS';
                                colorClass = 'bg-emerald-50 text-emerald-600';
                              } else if (notes.includes('backoffice_category: teléfono') || notes.includes('backoffice_category: movil')) {
                                label = 'BODEGA: MÓVILES';
                                colorClass = 'bg-amber-50 text-amber-600';
                              } else if (notes.includes('backoffice_category: equipo')) {
                                label = 'BODEGA: EQUIPOS';
                                colorClass = 'bg-slate-100 text-[#181c3a]';
                              } else if (status === 'PROCESADO' || status === 'RECIBIDO_BACKOFFICE') {
                                // Si ya se procesó pero no tiene etiqueta de destino
                                label = 'PROCESADO (SIN BODEGA)';
                                colorClass = 'bg-rose-50 text-rose-500';
                              }

                              return (
                                <Badge className={`border-none font-black text-[9px] uppercase tracking-widest whitespace-nowrap ${colorClass}`}>
                                  {label}
                                </Badge>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-black text-[#181c3a]">{item.received_units || 0}</span>
                            <span className="text-slate-400 text-[10px] font-bold ml-1">u.</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button 
                                onClick={() => setShowTimeline(item)} 
                                className="w-8 h-8 flex items-center justify-center bg-blue-50 text-[#2ec4f1] rounded-lg hover:bg-[#2ec4f1] hover:text-white transition-all shadow-sm"
                                title="Ver Trazabilidad"
                              >
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => alert("Abriendo cámara para cargar evidencia...")} 
                                className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-[#2ec4f1] hover:text-white transition-all shadow-sm"
                                title="Cargar Foto"
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => alert("Visualizando evidencia fotográfica...")} 
                                className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                                title="Ver Foto"
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleEditHistoryCAC(item.id, item.guiaIdx)} 
                                className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-[#181c3a] hover:text-white transition-all shadow-sm"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handlePrintCAC(item)} 
                                className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-[#181c3a] hover:text-white transition-all shadow-sm"
                                title="Imprimir PDF"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteHistoryCAC(item.id, item.guiaIdx)} 
                                className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {cacRecords.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-300 italic uppercase font-black tracking-widest">
                          No hay registros de CAC disponibles
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Registros: {cacRecords.length}</span>
                <div className="flex gap-1">
                  <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400"><ChevronLeft size={14} /></button>
                  <button className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#181c3a] text-white font-black text-[10px]">1</button>
                  <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors font-bold text-slate-400 text-[10px]">2</button>
                  <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400"><ChevronRight size={14} /></button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* MODAL DE TRAZABILIDAD (TIMELINE) */}
      {showTimeline && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden animate-rise-in p-0">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-[#2ec4f1] rounded-2xl flex items-center justify-center text-[#181c3a] shadow-lg shadow-[#2ec4f1]/20">
                   <History size={24} />
                 </div>
                 <div>
                   <h3 className="text-xl font-black text-[#181c3a] uppercase tracking-tighter leading-none">Trazabilidad de la Guía</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest font-mono">{showTimeline.currentGuia}</p>
                 </div>
               </div>
               <button onClick={() => { setShowTimeline(null); setTimelineActiveGuide(null); }} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100"><X size={20} /></button>
            </div>
            <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar bg-white">
               {showTimeline.allGuias && showTimeline.allGuias.length > 1 && (
                 <div className="flex flex-wrap gap-2 mb-8">
                   <button 
                     onClick={() => setTimelineActiveGuide(null)}
                     className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!timelineActiveGuide ? 'bg-[#181c3a] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                   >
                     Toda la Recepción
                   </button>
                   {showTimeline.allGuias.map((g: string) => (
                     <button 
                       key={g}
                       onClick={() => setTimelineActiveGuide(g)}
                       className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timelineActiveGuide === g ? 'bg-[#2ec4f1] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                     >
                       Guía {g}
                     </button>
                   ))}
                 </div>
               )}
               {timelineActiveGuide && (() => {
                 // Extraer detalles de backoffice de esta guía específica si existen
                 const notes = showTimeline.notes || '';
                 const regex = new RegExp(`\\[Guía[^\\]]*${timelineActiveGuide}[^\\]]*\\]([\\s\\S]*?)(?=\\n\\[Guía|\\n--- LÍNEA DE TIEMPO|$)`);
                 const match = notes.match(regex);
                 if (match && match[1].trim()) {
                   const lines = match[1].trim().split('\\n');
                   return (
                     <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Detalles de Backoffice</h4>
                       <div className="grid grid-cols-2 gap-4">
                         {lines.map((l: string, i: number) => {
                           const [k, ...v] = l.split(':');
                           if (!k || !v.length) return null;
                           const keyStr = k.replace('Backoffice_', '').replace('_', ' ').trim();
                           const valStr = v.join(':').trim();
                           return (
                             <div key={i} className="bg-white p-3 rounded-xl shadow-sm border border-slate-50">
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{keyStr}</p>
                               <p className="text-xs font-black text-[#181c3a] uppercase">{valStr}</p>
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   );
                 }
                 return null;
               })()}
               <div className="relative border-l-2 border-slate-100 ml-4 space-y-10">
                  {(() => {
                    const notes = showTimeline.notes || '';
                    const timelinePart = notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---') 
                                       ? notes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop() 
                                       : notes.split('--- LÍNEA DE TIEMPO ---').pop() || '';
                    const events = (timelinePart || '').trim().split('\n').filter((l: string) => l.trim() !== '');

                    let filteredEvents = events;
                    if (timelineActiveGuide) {
                       filteredEvents = events.filter((event: string) => {
                          if (!event.includes('(Guía ')) return true;
                          return event.includes(timelineActiveGuide);
                       });
                    }

                    if (filteredEvents.length === 0) {
                      return (
                        <div className="text-center py-20 opacity-20">
                          <Clock size={48} className="mx-auto mb-4" />
                          <p className="text-xs font-black uppercase tracking-widest">Sin eventos registrados</p>
                        </div>
                      );
                    }

                    let lastKnownTime = '';
                    return filteredEvents.map((event: string, idx: number) => {
                      let cleanTime = '';
                      let content = '';

                      if (event.includes('] ')) {
                        const [timeStr, ...rest] = event.split('] ');
                        cleanTime = (timeStr || '').replace('[', '');
                        lastKnownTime = cleanTime;
                        content = rest.join('] ');
                      } else {
                        // Skip corrupted lines
                        if (event.includes('---') || event.toUpperCase().includes('BACKOFFICE_') || event.toUpperCase().includes('GUÍAS PROCESADAS')) {
                           return null;
                        }
                        content = event;
                        cleanTime = lastKnownTime;
                      }
                      
                      // PARSE MATRIZ: ID | CODE | ACTION: DETAIL
                      const pipeParts = content.split(' | ');
                      let meta = '';
                      let body = content;
                      if (pipeParts.length > 2) {
                        meta = pipeParts[0] + ' | ' + pipeParts[1];
                        body = pipeParts.slice(2).join(' | ');
                      } else if (pipeParts.length === 2) {
                        meta = pipeParts[0];
                        body = pipeParts[1];
                      }
                      
                      let action = '';
                      let detail = '';
                      
                      if (body) {
                         const parts = body.split(': ');
                         if (parts.length > 1) {
                            action = parts[0];
                            detail = parts.slice(1).join(': ');
                         } else {
                            action = 'METADATO / EVENTO';
                            detail = body;
                         }
                      }


                      return (
                        <div key={idx} className="relative pl-10 group">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-[#2ec4f1] group-hover:scale-125 transition-transform shadow-sm" />
                          <div className="flex justify-between items-start mb-1">
                            {cleanTime && <p className="text-[9px] font-black text-[#2ec4f1] uppercase tracking-widest">{cleanTime}</p>}
                            {meta && (
                              <Badge className="bg-slate-100 text-slate-400 border-none text-[7px] font-black tracking-tighter px-1.5 h-4">
                                {meta.replace(' | ', ' • ')}
                              </Badge>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-[#181c3a] uppercase mb-1 tracking-tight">{action || 'EVENTO'}</h4>
                          <p className="text-[11px] font-bold text-slate-500 leading-relaxed uppercase">{detail || content}</p>
                        </div>
                      );
                    });
                  })()}
               </div>
            </div>
            <div className="p-8 bg-slate-50 text-center border-t border-slate-100">
               <Badge className="bg-[#181c3a] text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-xl">
                 Estatus Actual: {showTimeline.status}
               </Badge>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL DE DETALLES PX */}
      {showPxDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-7xl bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden animate-rise-in p-0 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                   <Eye size={24} />
                 </div>
                 <div>
                   <h3 className="text-lg font-black text-[#181c3a] uppercase tracking-tighter leading-none">Detalles de Recepción</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest font-mono">SAP: {showPxDetails.sap_document || '---'}</p>
                 </div>
               </div>
               <button onClick={() => setShowPxDetails(null)} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100"><X size={20} /></button>
            </div>
            <div className="p-6 bg-white border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Fecha de Creación</p>
                <p className="text-sm font-bold text-[#181c3a]">{showPxDetails.fecha_formateada || new Date(showPxDetails.created_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Agencia PX</p>
                <p className="text-sm font-bold text-[#181c3a]">{showPxDetails.carrier || '---'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Usuario</p>
                <p className="text-sm font-bold text-[#181c3a]">{showPxDetails.received_by || 'Admin User'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Total Equipos</p>
                <p className="text-sm font-bold text-[#181c3a]">{showPxDetails.received_units || 0}</p>
              </div>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-auto p-0 bg-slate-50/30 custom-scrollbar">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest sticky top-0">
                  <tr>
                    <th className="px-6 py-3">Serie (S1)</th>
                    <th className="px-6 py-3">Serie (S2)</th>
                    <th className="px-6 py-3">Serie (S3)</th>
                    <th className="px-6 py-3">Serie (S4)</th>
                    <th className="px-6 py-3">Marca</th>
                    <th className="px-6 py-3">Modelo</th>
                    <th className="px-6 py-3">Tecnología</th>
                    <th className="px-6 py-3">Material</th>
                    <th className="px-6 py-3">Caja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pxDetailsSeries.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">Cargando series o no hay equipos...</td></tr>
                  ) : (
                    pxDetailsSeries.map((s, idx) => (
                      <tr key={idx} className="hover:bg-white transition-colors">
                        <td className="px-6 py-3 font-mono font-black text-[#181c3a]">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {s.s1}
                          </div>
                        </td>
                        <td className="px-6 py-3 font-mono text-slate-500">{s.s2}</td>
                        <td className="px-6 py-3 font-mono text-slate-500">{s.s3}</td>
                        <td className="px-6 py-3 font-mono text-slate-500">{s.s4}</td>
                        <td className="px-6 py-3 font-bold text-slate-500">{s.brand || '-'}</td>
                        <td className="px-6 py-3 font-bold text-slate-500">{s.model || '-'}</td>
                        <td className="px-6 py-3 font-bold text-slate-500">{s.technology || '-'}</td>
                        <td className="px-6 py-3 font-bold text-slate-500">{s.material || '-'}</td>
                        <td className="px-6 py-3 font-bold text-[#2ec4f1] text-[10px]">{s.box_code || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </ModulePage>
  );
}
