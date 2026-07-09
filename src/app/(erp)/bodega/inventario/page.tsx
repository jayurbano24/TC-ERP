"use client";

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Button, DataTable, type DataTableColumn } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { Search, MapPin, Package, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getInventoryDetails, resolveWarehouseStatusLabel } from '@/modules/inventario/client/inventoryQueries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const EMPTY_ITEMS: any[] = [];

// C1: función pura a nivel de módulo (estable) para que las columnas memoizadas
// no se recreen en cada render.
function extractField(notes: string, fieldKey: string) {
  if (!notes) return '';
  const normalizedNotes = notes.replace(/\\n/g, '\n');
  const regex = new RegExp(fieldKey + ':\\s*(.*?)(?=\\s+[A-Za-z_]+:|\\s*---|\\s*$)', 'i');
  const match = normalizedNotes.match(regex);
  return match ? match[1].trim() : '';
}

export default function InventarioDetallePage() {
  const [searchTerm, setSearchTerm] = useState('');
  // C5: el input sigue ligado a searchTerm (fluido); el filtrado costoso sobre
  // la lista completa solo se recomputa con el término debounced.
  const debouncedSearch = useDebouncedValue(searchTerm, 250);

  const inventoryQuery = useQuery({
    queryKey: ['inventory-details'],
    queryFn: async () => {
      const result: any = await getInventoryDetails();
      if (result?.error) throw new Error(result.error);
      return (result?.data ?? []) as any[];
    },
  });
  const items = inventoryQuery.data ?? EMPTY_ITEMS;
  const loading = inventoryQuery.isLoading;

  const exportToExcel = () => {
    const headers = [
      'Fecha / Hora', 'No. Guía', 'Piloto', 'Courier', 'Recibió', 'Estatus',
      'Orden Servicio', 'Ingreso', 'Origen', 'Agencia / Proveedor', 'Tecnología',
      'Marca', 'Modelo', 'Caja', 'S-1', 'S-2', 'S-3', 'S-4', 'Material', 'Lote'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredItems.map(i => {
        const r = i.receptions || {};
        return [
          i.created_at ? new Date(i.created_at).toLocaleString() : 'N/A',
          r.guide_number || 'PX',
          extractField(r.notes, 'Piloto') || 'N/A',
          r.carrier || extractField(r.notes, 'Courier') || 'REDESIS',
          extractField(r.notes, 'Recibido Por') || r.received_by || 'SISTEMA',
          resolveWarehouseStatusLabel(i.current_status),
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
          i.valuation || extractField(r.notes, 'Notas') || '---',
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
        s4: g.series_list[3] || '---',
      };
    });

    return [...mergedGroups, ...ungrouped];
  }, [items]);

  const filteredItems = useMemo(() => {
    return groupedItems.filter((i) => {
      if (!debouncedSearch) return true;
      const s = debouncedSearch.toLowerCase();
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
  }, [groupedItems, debouncedSearch]);

  const inventarioColumns = useMemo<DataTableColumn<any>[]>(() => [
    {
      id: 'fecha',
      header: 'Fecha / Hora',
      width: '150px',
      cellClassName: 'whitespace-nowrap',
      cell: (item: any) => (item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'),
    },
    {
      id: 'guia',
      header: 'No. Guía',
      width: '95px',
      cellClassName: 'font-black text-[#181c3a]',
      cell: (item: any) => (item.receptions || {}).guide_number || 'PX',
    },
    {
      id: 'piloto',
      header: 'Piloto',
      width: '120px',
      cellClassName: 'uppercase',
      cell: (item: any) => extractField((item.receptions || {}).notes, 'Piloto') || 'N/A',
    },
    {
      id: 'courier',
      header: 'Courier',
      width: '120px',
      cellClassName: 'uppercase',
      cell: (item: any) => {
        const r = item.receptions || {};
        return r.carrier || extractField(r.notes, 'Courier') || 'REDESIS';
      },
    },
    {
      id: 'recibio',
      header: 'Recibió',
      width: '120px',
      cell: (item: any) => {
        const r = item.receptions || {};
        return extractField(r.notes, 'Recibido Por') || r.received_by || 'SISTEMA';
      },
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '140px',
      cell: (item: any) => {
        const statusLabel = resolveWarehouseStatusLabel(item.current_status);
        const statusVariant = item.current_status === 'in_central_warehouse' ? 'green' : 'purple';
        return <Badge variant={statusVariant}>{statusLabel}</Badge>;
      },
    },
    {
      id: 'os',
      header: 'Orden Servicio',
      width: '120px',
      cellClassName: 'font-black',
      cell: (item: any) => item.service_orders?.os_label || 'TC-00012',
    },
    {
      id: 'ingreso',
      header: 'Ingreso',
      width: '90px',
      cell: () => '1° Ingreso',
    },
    {
      id: 'origen',
      header: 'Origen',
      width: '80px',
      cellClassName: 'font-bold text-slate-600',
      cell: (item: any) => ((item.receptions || {}).source === 'cac' ? 'CAC' : 'PX'),
    },
    {
      id: 'agencia',
      header: 'Agencia / Proveedor',
      width: '150px',
      cellClassName: 'uppercase',
      cell: (item: any) => {
        const r = item.receptions || {};
        return extractField(r.notes, 'Backoffice_Agency') || extractField(r.notes, 'Agencia') || r.carrier || '---';
      },
    },
    {
      id: 'tecnologia',
      header: 'Tecnología',
      width: '110px',
      cellClassName: 'uppercase',
      cell: (item: any) =>
        item.models?.technologies?.name || extractField((item.receptions || {}).notes, 'Backoffice_Tech') || 'N/A',
    },
    {
      id: 'marca',
      header: 'Marca',
      width: '100px',
      cellClassName: 'uppercase',
      cell: (item: any) =>
        item.brands?.name || extractField((item.receptions || {}).notes, 'Backoffice_Brand') || 'N/A',
    },
    {
      id: 'modelo',
      header: 'Modelo',
      width: '120px',
      cellClassName: 'uppercase',
      cell: (item: any) =>
        item.models?.name || extractField((item.receptions || {}).notes, 'Backoffice_Model') || 'N/A',
    },
    {
      id: 'caja',
      header: 'Caja',
      width: '100px',
      cellClassName: 'font-black text-amber-500',
      cell: (item: any) => item.boxes?.box_code || item.boxes?.id || 'SIN CAJA',
    },
    {
      id: 's1',
      header: 'S-1',
      width: '120px',
      cellClassName: 'font-mono font-black text-[#181c3a]',
      cell: (item: any) => item.s1 || item.serial_number,
    },
    {
      id: 's2',
      header: 'S-2',
      width: '100px',
      cellClassName: 'font-mono font-bold text-[#181c3a]',
      cell: (item: any) => item.s2 || '---',
    },
    {
      id: 's3',
      header: 'S-3',
      width: '100px',
      cellClassName: 'font-mono font-bold text-[#181c3a]',
      cell: (item: any) => item.s3 || '---',
    },
    {
      id: 's4',
      header: 'S-4',
      width: '100px',
      cellClassName: 'font-mono font-bold text-[#181c3a]',
      cell: (item: any) => item.s4 || '---',
    },
    {
      id: 'material',
      header: 'Material',
      width: '100px',
      cellClassName: 'font-bold',
      cell: (item: any) => item.material || '---',
    },
    {
      id: 'lote',
      header: 'Lote',
      width: '120px',
      cell: (item: any) => item.valuation || '---',
    },
  ], []);

  // C1: KPIs por tecnología memoizados (antes se recomputaban en cada render).
  const techStats = useMemo(() => {
    const technologies = ['ADSL', 'DTH', 'EMTA', 'IPTV', 'ONT', 'STB-HFC', 'WTTH'];
    const techCounts = technologies.reduce((acc, tech) => {
      acc[tech] = filteredItems.filter(i => {
        const itemTech = (i.models?.technologies?.name || extractField(i.receptions?.notes, 'Backoffice_Tech') || '').toUpperCase();
        return itemTech === tech;
      }).length;
      return acc;
    }, {} as Record<string, number>);
    const uniqueOs = new Set(filteredItems.map(i => i.service_orders?.os_label).filter(Boolean)).size;
    return { technologies, techCounts, uniqueOs };
  }, [filteredItems]);

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
              <Link href="/bodega/gestion">
                <Button variant="outline" size="sm" className="h-7 px-2 text-slate-500 hover:text-[#181c3a] border-slate-200">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Regresar
                </Button>
              </Link>
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
          const { technologies, techCounts, uniqueOs } = techStats;

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
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando inventario...</div>
          ) : (
            <DataTable
              columns={inventarioColumns}
              data={filteredItems}
              getRowId={(_item: any, index: number) => index}
              rowHeight={56}
              maxBodyHeight={620}
              minWidth={2255}
              headerClassName="bg-[#181c3a]"
              headerTextClassName="text-white/90"
              emptyMessage="No se encontraron unidades"
            />
          )}
        </Card>
      </div>
    </ModulePage>
  );
}
