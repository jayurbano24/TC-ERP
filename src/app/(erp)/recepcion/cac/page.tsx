"use client";

import React, { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { Package, Truck, ClipboardList, Camera, QrCode, CheckCircle2, AlertCircle, Download, Plus } from 'lucide-react';

// Mock initial data
const initialRecords = [
  { 
    id: '101', 
    fecha: '28/04/2026 06:40 PM', 
    noGuia: '000101', 
    usuario: 'Geiry Urbano', 
    transportista: 'Juan Perez (Cargo Express)',
    tipo: 'Equipos',
    estatus: 'INGRESO A PROCESO',
    cajas: 5,
    evidencia: true,
    guias: ['GT-99101', 'GT-99102', 'GT-99103', 'GT-99104', 'GT-99105']
  },
  { 
    id: '100', 
    fecha: '28/04/2026 04:15 PM', 
    noGuia: '000100', 
    usuario: 'Herbert Patzan', 
    transportista: 'Mario Lopez (GUATEX)',
    tipo: 'Accesorios',
    estatus: 'BODEGA ACCESORIOS',
    cajas: 2,
    evidencia: true,
    guias: ['GX-1102', 'GX-1103']
  }
];


export default function RecepcionCacPage() {
  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState<'data' | 'evidence'>('data');
  const [scannedItems, setScannedItems] = useState<string[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [totalCajas, setTotalCajas] = useState<number>(0);
  const [tipoCarga, setTipoCarga] = useState<'Equipos' | 'Accesorios' | 'Devoluciones'>('Equipos');
  const [transportista, setTransportista] = useState('');
  const [courier, setCourier] = useState('Cargo Express');
  const [reproId, setReproId] = useState(() => {
    const lastId = initialRecords.length > 0 ? Math.max(...initialRecords.map(r => parseInt(r.noGuia))) : 100;
    return (lastId + 1).toString().padStart(6, '0');
  });

  const [records, setRecords] = useState(initialRecords);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'bandeja' | 'historial'>('bandeja');

  // Marcar como recibido
  const handleMarkAsReceived = (id: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, estatus: 'RECIBIDO' } : r));
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const val = scanInput.trim();
    if (!val) return;
    if (scannedItems.includes(val)) {
      alert(`La guía ${val} ya fue escaneada.`);
      setScanInput('');
      return;
    }
    if (totalCajas > 0 && scannedItems.length >= totalCajas) {
      alert(`Límite alcanzado.`);
      return;
    }
    setScannedItems([...scannedItems, val]);
    setScanInput('');
  };

  const handleFinalize = () => {
    const newRecordId = reproId;
    const newRecord = {
      id: newRecordId,
      fecha: new Date().toLocaleString('es-GT', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', hour12: true 
      }),
      noGuia: reproId,
      usuario: 'Geiry Urbano',
      transportista: `${transportista} (${courier})`,
      tipo: tipoCarga,
      estatus: tipoCarga === 'Equipos' ? 'INGRESO A PROCESO' : tipoCarga === 'Accesorios' ? 'BODEGA ACCESORIOS' : 'DEVOLUCIÓN',
      cajas: scannedItems.length,
      evidencia: false,
      guias: [...scannedItems]
    };

    setRecords([newRecord, ...records]);
    setLastCreatedId(newRecordId);
    setFormStep('evidence');
  };

  const handleEvidenceUpload = () => {
    if (lastCreatedId) {
      setRecords(prev => prev.map(r => r.id === lastCreatedId ? { ...r, evidencia: true } : r));
    }
    resetForm();
  };

  const resetForm = () => {
    setShowForm(false);
    setFormStep('data');
    setScannedItems([]);
    setTotalCajas(0);
    setTransportista('');
    setLastCreatedId(null);
    setReproId((prev) => {
      const nextId = parseInt(prev) + 1;
      return nextId.toString().padStart(6, '0');
    });
  };

  const handleExportPDF = (rec: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const guiasHtml = rec.guias.map((g: string, i: number) => `
      <div style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px;">
        <span style="color: #2ec4f1; font-weight: bold; margin-right: 10px;">[${i + 1}]</span> ${g}
      </div>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Manifiesto - ${rec.noGuia}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #181c3a; }
            .header { border-bottom: 4px solid #2ec4f1; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; }
            .meta { display: grid; grid-cols: 2; gap: 20px; margin-bottom: 40px; }
            .meta-item { background: #f8fafc; padding: 15px; border-radius: 10px; }
            .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 5px; display: block; }
            .value { font-size: 14px; font-weight: bold; }
            .guias-container { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
            .footer { margin-top: 50px; border-top: 1px solid #eee; pt: 20px; font-size: 10px; color: #94a3b8; text-align: center; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Manifiesto de Recepción</h1>
              <div style="font-family: monospace; font-weight: bold; color: #2ec4f1; margin-top: 5px;">${rec.noGuia}</div>
            </div>
            <div style="text-align: right; font-size: 12px; font-weight: bold; color: #64748b;">
              TC-ERP LOGÍSTICA
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
            <div class="meta-item">
              <span class="label">Fecha / Hora</span>
              <span class="value">${rec.fecha}</span>
            </div>
            <div class="meta-item">
              <span class="label">Transportista</span>
              <span class="value">${rec.transportista}</span>
            </div>
            <div class="meta-item">
              <span class="label">Usuario</span>
              <span class="value">${rec.usuario}</span>
            </div>
            <div class="meta-item">
              <span class="label">Tipo de Carga</span>
              <span class="value">${rec.tipo}</span>
            </div>
            <div class="meta-item">
              <span class="label">Total Cajas</span>
              <span class="value">${rec.cajas}</span>
            </div>
            <div class="meta-item">
              <span class="label">Estatus</span>
              <span class="value">${rec.estatus}</span>
            </div>
          </div>

          <div style="margin-bottom: 10px;">
            <span class="label">Detalle de Guías Recibidas (${rec.guias.length})</span>
          </div>
          <div class="guias-container">
            ${guiasHtml}
          </div>

          <div style="margin-top: 60px; display: flex; justify-content: space-between;">
            <div style="width: 200px; border-top: 1px solid #000; text-align: center; padding-top: 10px;">
              <span class="label">Firma Transportista</span>
            </div>
            <div style="width: 200px; border-top: 1px solid #000; text-align: center; padding-top: 10px;">
              <span class="label">Firma Receptor CAC</span>
            </div>
          </div>

          <div class="footer">
            Generado automáticamente por TC-ERP - ${new Date().toLocaleString()}
          </div>

          <script>
            window.onload = function() { 
              window.print(); 
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <ModulePage
      title="Recepción de Carga (CAC)"
      category="Logística"
      actions={
        <Button 
          variant={showForm ? "outline" : "primary"} 
          onClick={() => setShowForm(!showForm)}
          leftIcon={showForm ? null : <Truck className="w-4 h-4" />}
        >
          {showForm ? 'Cancelar Registro' : 'Nueva Recepción'}
        </Button>
      }
    >
      <div className="space-y-10">
        {showForm && (
          <Card className="p-0 overflow-hidden border-2 border-[#2ec4f1]/20">
            <div className="bg-[#181c3a] p-8 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-3 rounded-2xl">
                  <ClipboardList className="w-6 h-6 text-[#2ec4f1]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Registro de Manifiesto</h2>
                  <p className="text-white/60 text-xs font-medium">Complete los datos de la carga recibida</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">ID Recepción</span>
                <Badge variant="slate" className="text-sm font-mono px-4 py-1.5">{reproId}</Badge>
              </div>
            </div>

            <div className="p-8 space-y-10">
              {formStep === 'data' ? (
                <>
                  <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clasificación</label>
                      <select 
                        value={tipoCarga}
                        onChange={(e) => setTipoCarga(e.target.value as any)}
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 outline-none font-bold text-sm focus:ring-2 focus:ring-[#2ec4f1]/20 transition-all"
                      >
                        <option value="Equipos">Ingreso de Equipos</option>
                        <option value="Accesorios">Ingreso de Accesorios</option>
                        <option value="Devoluciones">Ingreso de Devoluciones</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Courier</label>
                      <select 
                        value={courier}
                        onChange={(e) => setCourier(e.target.value)}
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 outline-none font-bold text-sm focus:ring-2 focus:ring-[#2ec4f1]/20 transition-all"
                      >
                        <option value="Cargo Express">Cargo Express</option>
                        <option value="GUATEX">GUATEX</option>
                        <option value="DHL">DHL</option>
                        <option value="Otros">Otros</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transportista</label>
                      <div className="relative">
                        <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input 
                          type="text"
                          value={transportista}
                          onChange={(e) => setTransportista(e.target.value)}
                          placeholder="Nombre del piloto"
                          className="w-full bg-slate-50 pl-12 pr-4 py-4 rounded-xl border border-slate-200 outline-none font-bold text-sm focus:ring-2 focus:ring-[#2ec4f1]/20 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Cajas</label>
                      <div className="relative">
                        <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input 
                          type="number"
                          value={totalCajas || ''}
                          onChange={(e) => setTotalCajas(parseInt(e.target.value) || 0)}
                          placeholder="Cantidad"
                          className="w-full bg-slate-50 pl-12 pr-4 py-4 rounded-xl border border-slate-200 outline-none font-bold text-sm focus:ring-2 focus:ring-[#2ec4f1]/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <QrCode className="w-5 h-5 text-[#2ec4f1]" />
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Pistoleo de Guías</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">Progresión:</span>
                        <Badge variant={scannedItems.length === totalCajas && totalCajas > 0 ? "green" : "blue"}>
                          {scannedItems.length} / {totalCajas}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <input 
                        type="text"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleScan(e)}
                        disabled={totalCajas <= 0 || scannedItems.length >= totalCajas}
                        placeholder={totalCajas <= 0 ? "Indique cantidad total primero..." : "Escanee código de barra..."}
                        className="flex-1 bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 focus:border-[#2ec4f1] outline-none text-lg font-mono font-bold shadow-sm transition-all"
                      />
                      <Button 
                        variant="primary" 
                        className="px-12 rounded-2xl"
                        disabled={totalCajas <= 0 || scannedItems.length >= totalCajas}
                        onClick={handleScan}
                      >
                        Añadir
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-8">
                      {scannedItems.map((item, i) => (
                        <div key={i} className="bg-slate-50 p-3 rounded-xl text-[10px] font-mono font-bold flex items-center justify-between group border border-slate-200/50">
                          <span className="truncate">{item}</span>
                          <button 
                            onClick={() => setScannedItems(scannedItems.filter((_, idx) => idx !== i))}
                            className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-end items-end gap-4 pt-8 border-t border-slate-100">
                    {scannedItems.length === totalCajas && totalCajas > 0 ? (
                      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Carga Completa</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-full border border-amber-100">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Pendiente de Escaneo</span>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setShowForm(false)}>Descartar</Button>
                      <Button 
                        variant="success" 
                        onClick={handleFinalize}
                        disabled={scannedItems.length !== totalCajas || totalCajas === 0 || !transportista}
                        className="px-10"
                      >
                        Finalizar y Generar Manifiesto
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center space-y-8 animate-rise-in">
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">¡Manifiesto Aceptado!</h3>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto">El registro se ha guardado correctamente. Ahora, por favor suba la evidencia física (guía firmada).</p>
                  </div>

                  <div 
                    onClick={handleEvidenceUpload}
                    className="w-full max-w-md flex flex-col items-center gap-4 bg-[#f8fafc] p-10 rounded-[2.5rem] border-2 border-dashed border-[#2ec4f1]/30 hover:bg-[#2ec4f1]/5 transition-all cursor-pointer group"
                  >
                    <div className="bg-white p-4 rounded-2xl shadow-xl shadow-[#2ec4f1]/10 group-hover:scale-110 transition-transform">
                      <Camera className="w-8 h-8 text-[#2ec4f1]" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-slate-700 uppercase tracking-widest mb-1">Cargar Evidencia Física</p>
                      <p className="text-[10px] text-slate-400 font-medium">Capture o seleccione la foto de la guía</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button variant="ghost" onClick={resetForm} className="text-slate-400">Omitir por ahora</Button>
                    <Button variant="primary" onClick={handleEvidenceUpload} className="px-12">Finalizar Todo</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Tabs para Bandeja e Historial */}
        <div className="flex gap-4 mb-6">
          <button
            className={`px-4 py-2 rounded-lg font-black uppercase text-xs tracking-widest transition-all ${activeTab === 'bandeja' ? 'bg-[#181c3a] text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
            onClick={() => setActiveTab('bandeja')}
          >
            Bandeja de Entrada
          </button>
          <button
            className={`px-4 py-2 rounded-lg font-black uppercase text-xs tracking-widest transition-all ${activeTab === 'historial' ? 'bg-[#181c3a] text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
            onClick={() => setActiveTab('historial')}
          >
            Historial Detallado
          </button>
        </div>

        {activeTab === 'bandeja' && (
          <section className="space-y-6">
            <ModuleToolbar onSearch={(val) => console.log('Search:', val)} />
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha / Hora</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">ID Recepción</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Transportista</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Clasificación</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estatus</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cajas</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.filter(rec => rec.estatus !== 'RECIBIDO').map((rec) => (
                      <tr 
                        key={rec.id} 
                        className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedRecord(rec)}
                      >
                        <td className="px-6 py-5">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{rec.fecha.split(' ')[0]}</span>
                            <span className="text-[10px] font-medium text-slate-400">{rec.fecha.split(' ').slice(1).join(' ')}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-sm font-black text-[#181c3a] font-mono">{rec.noGuia}</span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                              {rec.transportista.charAt(0)}
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{rec.transportista}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <Badge variant={rec.tipo === 'Equipos' ? 'blue' : rec.tipo === 'Accesorios' ? 'yellow' : 'red'}>
                            {rec.tipo.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              rec.estatus.includes('PROCESO') ? 'bg-[#2ec4f1]' : 
                              rec.estatus.includes('BODEGA') ? 'bg-amber-400' : 'bg-rose-500'
                            }`} />
                            <span className="text-[10px] font-black uppercase tracking-tight text-slate-600">{rec.estatus}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-sm font-bold text-slate-700">{rec.cajas}</span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {rec.evidencia && <Camera className="w-4 h-4 text-emerald-500" />}
                            <Download className="w-4 h-4 text-slate-300 group-hover:text-[#2ec4f1] transition-colors" />
                            <Button 
                              size="sm"
                              variant="primary"
                              className="ml-2 px-3 py-1 text-xs"
                              onClick={e => { e.stopPropagation(); handleMarkAsReceived(rec.id); }}
                            >
                              Marcar Recibido
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {activeTab === 'historial' && (
          <section className="space-y-6">
            <ModuleToolbar onSearch={(val) => console.log('Search:', val)} />
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha / Hora</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">ID Recepción</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Transportista</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Clasificación</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estatus</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cajas</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.filter(rec => rec.estatus === 'RECIBIDO').map((rec) => (
                      <tr 
                        key={rec.id} 
                        className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedRecord(rec)}
                      >
                        <td className="px-6 py-5">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{rec.fecha.split(' ')[0]}</span>
                            <span className="text-[10px] font-medium text-slate-400">{rec.fecha.split(' ').slice(1).join(' ')}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-sm font-black text-[#181c3a] font-mono">{rec.noGuia}</span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                              {rec.transportista.charAt(0)}
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{rec.transportista}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <Badge variant={rec.tipo === 'Equipos' ? 'blue' : rec.tipo === 'Accesorios' ? 'yellow' : 'red'}>
                            {rec.tipo.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500`} />
                            <span className="text-[10px] font-black uppercase tracking-tight text-slate-600">{rec.estatus}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-sm font-bold text-slate-700">{rec.cajas}</span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {rec.evidencia && <Camera className="w-4 h-4 text-emerald-500" />}
                            <Download className="w-4 h-4 text-slate-300 group-hover:text-[#2ec4f1] transition-colors" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {/* Modal de Detalle */}
        {selectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
            <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden">
              <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-2 rounded-xl">
                    <ClipboardList className="w-5 h-5 text-[#2ec4f1]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Detalle de Manifiesto</h3>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">{selectedRecord.noGuia}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedRecord(null)} className="text-white/40 hover:text-white transition-colors">
                  ✕
                </button>
              </div>
              
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fecha</span>
                    <span className="text-xs font-bold text-slate-700">{selectedRecord.fecha}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Transportista</span>
                    <span className="text-xs font-bold text-slate-700">{selectedRecord.transportista}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Usuario</span>
                    <span className="text-xs font-bold text-slate-700">{selectedRecord.usuario}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-[#2ec4f1]" />
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Guías Recibidas ({selectedRecord.guias?.length || 0})</h4>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="max-h-60 overflow-y-auto p-4 custom-scrollbar">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {selectedRecord.guias?.map((guia: string, i: number) => (
                          <div key={i} className="bg-white p-2.5 rounded-lg border border-slate-100 text-[10px] font-mono font-bold text-slate-600 flex items-center gap-2">
                            <span className="w-4 h-4 bg-[#2ec4f1]/10 text-[#2ec4f1] rounded flex items-center justify-center text-[8px]">{i + 1}</span>
                            {guia}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button variant="outline" onClick={() => setSelectedRecord(null)}>Cerrar</Button>
                  <Button 
                    variant="primary" 
                    leftIcon={<Download className="w-4 h-4" />}
                    onClick={() => handleExportPDF(selectedRecord)}
                  >
                    Exportar PDF
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </ModulePage>
  );
}
