"use client";

import React, { useState, useEffect } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { Search, MapPin, Package, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getInventoryDetails } from '@/lib/database/warehouse';

export default function InventarioDetallePage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const extractField = (notes: string, fieldKey: string) => {
    if (!notes) return '';
    const regex = new RegExp(fieldKey + ':\\s*(.*?)(?=\\s+[A-Za-z_]+:|\\s*---|\\s*$)', 'i');
    const match = notes.match(regex);
    return match ? match[1].trim() : '';
  };

  const fetchData = async () => {
    setLoading(true);
    const result: any = await getInventoryDetails();
    if (result && result.data) {
      setItems(result.data);
    } else if (result && result.error) {
      console.error(result.error);
    }
    setLoading(false);
  };

  const exportToExcel = () => {
    if (filteredItems.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    const headers = ['Fecha / Hora', 'No. Guía', 'Piloto', 'Courier', 'Recibió', 'Estatus', 'Orden Servicio', 'Ingreso', 'Origen', 'Agencia / Proveedor', 'Tecnología', 'Marca', 'Modelo', 'Caja', 'S-1', 'S-2', 'S-3', 'S-4', 'Material', 'Lote'];
    const csvContent = [
      headers.join(','),
      ...filteredItems.map(i => {
        const r = i.receptions || {};
        return [
          i.created_at ? new Date(i.created_at).toLocaleString() : 'N/A',
          r.guide_number || 'PX',
          extractField(r.notes, 'Piloto') || 'N/A',
          r.carrier || extractField(r.notes, 'Courier') || 'REDESIS',
          r.received_by || 'Admin User',
          'BODEGA CENTRAL',
          i.service_orders?.os_label || 'TC-00012',
          '1° Ingreso',
          r.source === 'cac' ? 'CAC' : 'PX',
          extractField(r.notes, 'Backoffice_Agency') || extractField(r.notes, 'Agencia') || r.carrier || '---',
          i.models?.technologies?.name || extractField(r.notes, 'Backoffice_Tech') || 'N/A',
          i.brands?.name || extractField(r.notes, 'Backoffice_Brand') || 'N/A',
          i.models?.name || extractField(r.notes, 'Backoffice_Model') || 'N/A',
          i.boxes?.box_code || i.boxes?.id || 'SIN CAJA',
          i.s1 || i.serial_number || '',
          i.s2 || '---',
          i.s3 || '---',
          i.s4 || '---',
          i.material || '---',
          i.valuation || extractField(r.notes, 'Notas') || '---'
        ].map(v => '"' + v + '"').join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'detalle_inventario.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const groupedItems = React.useMemo(() => {
    const groups: { [key: string]: any } = {};
    const ungrouped: any[] = [];
    
    items.forEach(i => {
      const soId = i.service_order_id;
      if (!soId) {
        ungrouped.push({ ...i, s1: i.serial_number, s2: i.s2, s3: i.s3, s4: i.s4 });
        return;
      }
      if (!groups[soId]) {
        groups[soId] = { ...i, series_list: [] };
      }
      groups[soId].series_list.push(i.serial_number);
      if (i.material) groups[soId].material = i.material;
      if (i.valuation) groups[soId].valuation = i.valuation;
    });

    const mergedGroups = Object.values(groups).map(g => {
      return {
        ...g,
        s1: g.series_list[0] || g.serial_number,
        s2: g.series_list[1] || '---',
        s3: g.series_list[2] || '---',
        s4: g.series_list[3] || '---'
      };
    });

    return [...mergedGroups, ...ungrouped];
  }, [items]);

  const filteredItems = groupedItems.filter(i => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      (i.s1 || '').toLowerCase().includes(s) ||
      (i.s2 || '').toLowerCase().includes(s) ||
      (i.s3 || '').toLowerCase().includes(s) ||
      (i.s4 || '').toLowerCase().includes(s) ||
      (i.service_orders?.os_label || '').toLowerCase().includes(s) ||
      (i.boxes?.id || '').toLowerCase().includes(s) ||
      (i.material || '').toLowerCase().includes(s) ||
      (i.models?.technologies?.name || '').toLowerCase().includes(s) ||
      (i.brands?.name || '').toLowerCase().includes(s) ||
      (i.models?.name || '').toLowerCase().includes(s)
    );
  });

  return (
    <ModulePage
      title=""
      subtitle=""
      category="Bodega"
    >
      <div className="p-8 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Button variant="outline" size="sm" className="h-7 px-2 text-slate-500 hover:text-[#181c3a] border-slate-200" onClick={() => window.history.back()}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Regresar
              </Button>
              <Badge variant="purple">BODEGA</Badge>
            </div>
            <h1 className="text-2xl font-black text-[#181c3a] tracking-tight">Detalle de Inventario</h1>
            <p className="text-sm text-slate-500 font-medium">Vista a nivel de unidad para todo el inventario en bodega.</p>
          </div>
        </div>

        <div className="flex justify-between items-center bg-white p-4 rounded-xl border-2 border-slate-100 shadow-sm">
          <div className="flex-1 max-w-md relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por serie, orden de servicio o caja..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-[#2ec4f1] outline-none text-sm font-medium"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={exportToExcel} className="bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider">
              <Download className="w-4 h-4 mr-2" /> Exportar a Excel
            </Button>
          </div>
        </div>

        {/* KPI Cards: Technology Breakdown */}
        {(() => {
          const technologies = ['ADSL', 'DTH', 'EMTA', 'IPTV', 'ONT', 'STB-HFC', 'WTTH'];
          const techCounts = technologies.reduce((acc, tech) => {
            acc[tech] = filteredItems.filter(i => {
              const itemTech = (i.models?.technologies?.name || extractField(i.receptions?.notes, 'Backoffice_Tech') || '').toUpperCase();
              return itemTech === tech;
            }).length;
            return acc;
          }, {} as Record<string, number>);
          
          const uniqueOs = new Set(filteredItems.map(i => i.service_orders?.os_label).filter(Boolean)).size;

          return (
            <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
              {technologies.map(tech => (
                <Card key={tech} className="min-w-[130px] p-6 text-center border-2 border-slate-50 hover:border-slate-100 shadow-sm rounded-[2rem] bg-white flex-shrink-0 transition-all">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">{tech}</p>
                  <h3 className="text-4xl font-black text-[#181c3a] my-3">{techCounts[tech] || 0}</h3>
                  <p className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">Equipos</p>
                </Card>
              ))}
              <Card className="min-w-[140px] p-6 text-center border-2 border-[#2ec4f1]/20 bg-white shadow-sm rounded-[2rem] flex-shrink-0 transition-all">
                <p className="text-[10px] font-black uppercase text-[#2ec4f1] tracking-widest mb-1">Total Global</p>
                <h3 className="text-4xl font-black text-[#181c3a] my-3">{filteredItems.length}</h3>
                <p className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">Unidades</p>
              </Card>
              <Card className="min-w-[140px] p-6 text-center border-2 border-slate-50 bg-white shadow-sm rounded-[2rem] flex-shrink-0 transition-all">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Órdenes (OS)</p>
                <h3 className="text-4xl font-black text-[#181c3a] my-3">{uniqueOs}</h3>
                <p className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">Generadas</p>
              </Card>
            </div>
          );
        })()}

        <Card className="overflow-hidden border-2 border-slate-100 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-[#181c3a] text-white font-black uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-4 py-4">Fecha / Hora</th>
                  <th className="px-4 py-4">No. Guía</th>
                  <th className="px-4 py-4">Piloto</th>
                  <th className="px-4 py-4">Courier</th>
                  <th className="px-4 py-4">Recibió</th>
                  <th className="px-4 py-4">Estatus</th>
                  <th className="px-4 py-4">Orden Servicio</th>
                  <th className="px-4 py-4">Ingreso</th>
                  <th className="px-4 py-4">Origen</th>
                  <th className="px-4 py-4">Agencia / Proveedor</th>
                  <th className="px-4 py-4">Tecnología</th>
                  <th className="px-4 py-4">Marca</th>
                  <th className="px-4 py-4">Modelo</th>
                  <th className="px-4 py-4">Caja</th>
                  <th className="px-4 py-4">S-1</th>
                  <th className="px-4 py-4">S-2</th>
                  <th className="px-4 py-4">S-3</th>
                  <th className="px-4 py-4">S-4</th>
                  <th className="px-4 py-4">Material</th>
                  <th className="px-4 py-4">Lote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr><td colSpan={19} className="p-8 text-center text-slate-400">Cargando inventario...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={19} className="p-8 text-center text-slate-400 font-bold">No se encontraron unidades</td></tr>
                ) : filteredItems.map((item, idx) => {
                  const r = item.receptions || {};
                  if (idx === 0) console.log("DEBUG ITEM:", item);
                  return (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4">{item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}</td>
                    <td className="px-4 py-4 font-black text-[#181c3a]">{r.guide_number || 'PX'}</td>
                    <td className="px-4 py-4 uppercase">{extractField(r.notes, 'Piloto') || 'N/A'}</td>
                    <td className="px-4 py-4 uppercase">{r.carrier || extractField(r.notes, 'Courier') || 'REDESIS'}</td>
                    <td className="px-4 py-4">{r.received_by || 'Admin User'}</td>
                    <td className="px-4 py-4">
                      <Badge variant="green">BODEGA CENTRAL</Badge>
                    </td>
                    <td className="px-4 py-4 font-black">{item.service_orders?.os_label || 'TC-00012'}</td>
                    <td className="px-4 py-4">1° Ingreso</td>
                    <td className="px-4 py-4 font-bold text-slate-600">{r.source === 'cac' ? 'CAC' : 'PX'}</td>
                    <td className="px-4 py-4 uppercase">{extractField(r.notes, 'Backoffice_Agency') || extractField(r.notes, 'Agencia') || r.carrier || '---'}</td>
                    <td className="px-4 py-4 uppercase">{item.models?.technologies?.name || extractField(r.notes, 'Backoffice_Tech') || 'N/A'}</td>
                    <td className="px-4 py-4 uppercase">{item.brands?.name || extractField(r.notes, 'Backoffice_Brand') || 'N/A'}</td>
                    <td className="px-4 py-4 uppercase">{item.models?.name || extractField(r.notes, 'Backoffice_Model') || 'N/A'}</td>
                    <td className="px-4 py-4 font-black text-amber-500">{item.boxes?.box_code || item.boxes?.id || 'SIN CAJA'}</td>
                    <td className="px-4 py-4 font-black text-[#2ec4f1]">{item.s1 || item.serial_number}</td>
                    <td className="px-4 py-4 text-slate-500">{item.s2 || '---'}</td>
                    <td className="px-4 py-4 text-slate-500">{item.s3 || '---'}</td>
                    <td className="px-4 py-4 text-slate-500">{item.s4 || '---'}</td>
                    <td className="px-4 py-4 font-bold">{item.material || '---'}</td>
                    <td className="px-4 py-4">{item.valuation || '---'}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </ModulePage>
  );
}
