"use client";

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Button, DataTable, type DataTableColumn } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { SapValidationBadge, SeriesSapValidationDots } from '@/components/sap/SapValidationBadge';
import { Search, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getInventoryDetails, resolveWarehouseStatusLabel } from '@/modules/inventario/client/inventoryQueries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';

const EMPTY_ITEMS: any[] = [];

function extractField(notes: string, fieldKey: string) {
  if (!notes) return '';
  const normalizedNotes = notes.replace(/\\n/g, '\n');
  const regex = new RegExp(fieldKey + ':\\s*(.*?)(?=\\s+[A-Za-z_]+:|\\s*---|\\s*$)', 'i');
  const match = normalizedNotes.match(regex);
  return match ? match[1].trim() : '';
}

export default function InventarioDetallePage() {
  const [searchTerm, setSearchTerm] = useState('');
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
      'Fecha / Hora', 'No. Guía', 'Orden Servicio', 'Val. SAP',
      'S-1 (SAP)', 'S-2', 'S-3', 'S-4', 'Material', 'Valoración',
      'Estatus', 'Caja', 'Tecnología', 'Marca', 'Modelo',
      'Piloto', 'Courier', 'Recibió', 'Ingreso', 'Origen', 'Agencia / Proveedor'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredItems.map(i => {
        const r = i.receptions || {};
        return [
          i.created_at ? new Date(i.created_at).toLocaleString() : 'N/A',
          r.guide_number || 'PX',
          i.service_orders?.os_label || 'TC-00012',
          i.unitSapValidationStatus || 'Pendiente Validación',
          i.s1 || i.serial_number || '',
          i.s2 || '---',
          i.s3 || '---',
          i.s4 || '---',
          i.material || '---',
          i.valuation || '---',
          resolveWarehouseStatusLabel(i.current_status),
          i.boxes?.box_code || i.boxes?.id || 'SIN CAJA',
          i.models?.technologies?.name || extractField(r.notes, 'Backoffice_Tech') || 'N/A',
          i.brands?.name || extractField(r.notes, 'Backoffice_Brand') || 'N/A',
          i.models?.name || extractField(r.notes, 'Backoffice_Model') || 'N/A',
          extractField(r.notes, 'Piloto') || 'N/A',
          r.carrier || extractField(r.notes, 'Courier') || 'REDESIS',
          extractField(r.notes, 'Recibido Por') || r.received_by || 'SISTEMA',
          i.service_orders?.reentry_count ? `${i.service_orders.reentry_count}° Ingreso` : '1° Ingreso',
          r.source === 'cac' ? 'CAC' : 'PX',
          extractField(r.notes, 'Backoffice_Agency') || extractField(r.notes, 'Agencia') || r.carrier || '---',
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

    const isSapValidated = (status?: string | null) => {
      const key = String(status || '').trim().toLowerCase();
      return key === 'validado' || key === 'validado sap';
    };

    /** S1 = serie Validada SAP (si hay); luego main_serial; luego fecha. */
    const orderSeriesForDisplay = (rows: any[]) => {
      const mainSerial = String(rows.find((r) => r?.service_orders)?.service_orders?.main_serial || '')
        .trim()
        .toUpperCase();
      return [...rows].sort((a, b) => {
        const aOk = isSapValidated(a.sap_status) ? 0 : 1;
        const bOk = isSapValidated(b.sap_status) ? 0 : 1;
        if (aOk !== bOk) return aOk - bOk;
        if (mainSerial) {
          const aSn = String(a.serial_number || '').toUpperCase();
          const bSn = String(b.serial_number || '').toUpperCase();
          if (aSn === mainSerial && bSn !== mainSerial) return -1;
          if (bSn === mainSerial && aSn !== mainSerial) return 1;
        }
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a.serial_number || '').localeCompare(String(b.serial_number || ''));
      });
    };

    items.forEach((i) => {
      const soId = i.service_order_id;
      if (!soId) {
        const seriesSapStatuses = [i.sap_status || 'Pendiente'];
        ungrouped.push({
          ...i,
          s1: i.serial_number,
          s2: i.s2,
          s3: i.s3,
          s4: i.s4,
          seriesSapStatuses,
          unitSapValidationStatus: resolveUnitSapStatus(
            i.service_orders?.sap_integration_status,
            seriesSapStatuses
          ),
        });
        return;
      }
      if (!groups[soId]) {
        groups[soId] = {
          ...i,
          series_rows: [] as any[],
        };
      }
      groups[soId].series_rows.push(i);
      if (i.material) groups[soId].material = i.material;
      if (i.valuation) groups[soId].valuation = i.valuation;
      if (i.service_orders?.sap_integration_status) {
        groups[soId].service_orders = {
          ...groups[soId].service_orders,
          ...i.service_orders,
        };
      }
    });

    const mergedGroups = Object.values(groups).map((g) => {
      const ordered = orderSeriesForDisplay(g.series_rows as any[]);
      // Preferir material/valuation de la serie Validada (S1)
      const primary = ordered.find((r) => isSapValidated(r.sap_status)) || ordered[0];
      const seriesSapStatuses = ordered.map((r) => r.sap_status || 'Pendiente');
      return {
        ...g,
        ...(primary || {}),
        service_orders: g.service_orders,
        material: primary?.material || g.material || null,
        valuation: primary?.valuation || g.valuation || null,
        s1: ordered[0]?.serial_number || g.serial_number,
        s2: ordered[1]?.serial_number || '---',
        s3: ordered[2]?.serial_number || '---',
        s4: ordered[3]?.serial_number || '---',
        seriesSapStatuses,
        unitSapValidationStatus: resolveUnitSapStatus(
          g.service_orders?.sap_integration_status,
          seriesSapStatuses
        ),
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
        (i.boxes?.box_code || '').toLowerCase().includes(s) ||
        (i.boxes?.id || '').toLowerCase().includes(s) ||
        (i.material || '').toLowerCase().includes(s) ||
        (i.valuation || '').toLowerCase().includes(s) ||
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
      width: '140px',
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
      id: 'os',
      header: 'Orden Servicio',
      width: '110px',
      cellClassName: 'font-black',
      cell: (item: any) => item.service_orders?.os_label || 'TC-00012',
    },
    {
      id: 'val_sap',
      header: 'Val. SAP',
      width: '140px',
      cell: (item: any) => (
        <div className="flex flex-col gap-0.5 items-start">
          <SapValidationBadge status={item.unitSapValidationStatus || 'Pendiente Validación'} />
          <SeriesSapValidationDots statuses={item.seriesSapStatuses || []} />
        </div>
      ),
    },
    {
      id: 's1',
      header: 'S-1 (SAP)',
      width: '130px',
      cellClassName: 'font-mono font-medium text-[#181c3a]',
      cell: (item: any) => item.s1 || item.serial_number,
    },
    {
      id: 's2',
      header: 'S-2',
      width: '110px',
      cellClassName: 'font-mono font-medium text-[#181c3a]',
      cell: (item: any) => item.s2 || '---',
    },
    {
      id: 's3',
      header: 'S-3',
      width: '110px',
      cellClassName: 'font-mono font-medium text-[#181c3a]',
      cell: (item: any) => item.s3 || '---',
    },
    {
      id: 's4',
      header: 'S-4',
      width: '110px',
      cellClassName: 'font-mono font-medium text-[#181c3a]',
      cell: (item: any) => item.s4 || '---',
    },
    {
      id: 'material',
      header: 'Material',
      width: '110px',
      cellClassName: 'font-bold',
      cell: (item: any) => item.material || '---',
    },
    {
      id: 'valoracion',
      header: 'Valoración',
      width: '110px',
      cell: (item: any) => item.valuation || '---',
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '130px',
      cell: (item: any) => {
        const statusLabel = resolveWarehouseStatusLabel(item.current_status);
        const statusVariant = item.current_status === 'in_central_warehouse' ? 'green' : 'purple';
        return <Badge variant={statusVariant}>{statusLabel}</Badge>;
      },
    },
    {
      id: 'caja',
      header: 'Caja',
      width: '100px',
      cellClassName: 'font-black text-amber-500',
      cell: (item: any) => item.boxes?.box_code || item.boxes?.id || 'SIN CAJA',
    },
    {
      id: 'tecnologia',
      header: 'Tecnología',
      width: '100px',
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
      id: 'piloto',
      header: 'Piloto',
      width: '110px',
      cellClassName: 'uppercase',
      cell: (item: any) => extractField((item.receptions || {}).notes, 'Piloto') || 'N/A',
    },
    {
      id: 'courier',
      header: 'Courier',
      width: '110px',
      cellClassName: 'uppercase',
      cell: (item: any) => {
        const r = item.receptions || {};
        return r.carrier || extractField(r.notes, 'Courier') || 'REDESIS';
      },
    },
    {
      id: 'recibio',
      header: 'Recibió',
      width: '140px',
      cell: (item: any) => {
        const r = item.receptions || {};
        return extractField(r.notes, 'Recibido Por') || r.received_by || 'SISTEMA';
      },
    },
    {
      id: 'ingreso',
      header: 'Ingreso',
      width: '90px',
      cell: (item: any) =>
        item.service_orders?.reentry_count
          ? `${item.service_orders.reentry_count}° Ingreso`
          : '1° Ingreso',
    },
    {
      id: 'origen',
      header: 'Origen',
      width: '70px',
      cellClassName: 'font-bold text-slate-600',
      cell: (item: any) => ((item.receptions || {}).source === 'cac' ? 'CAC' : 'PX'),
    },
    {
      id: 'agencia',
      header: 'Agencia / Proveedor',
      width: '140px',
      cellClassName: 'uppercase',
      cell: (item: any) => {
        const r = item.receptions || {};
        return extractField(r.notes, 'Backoffice_Agency') || extractField(r.notes, 'Agencia') || r.carrier || '---';
      },
    },
  ], []);

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
            <p className="text-sm text-slate-500 font-medium">Vista a nivel de equipo TC (OS) con validación SAP, Material y Valoración.</p>
          </div>
        </div>

        <div className="flex justify-between items-center bg-white p-4 rounded-xl border-2 border-slate-100 shadow-sm">
          <div className="flex-1 max-w-md relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por serie, OS, caja, material..."
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
                <p className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">Equipos TC</p>
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
              rowHeight={64}
              maxBodyHeight={620}
              minWidth={2680}
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
