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

  const exportToExcel = async () => {
    const rows = filteredItems.map((i) => {
      const r = i.receptions || {};
      return {
        'Fecha / Hora': i.created_at ? new Date(i.created_at).toLocaleString() : 'N/A',
        'No. Guía': r.guide_number || 'PX',
        'Orden Servicio': i.service_orders?.os_label || '---',
        'Val. SAP': i.unitSapValidationStatus || 'Pendiente Validación',
        'S-1 (SAP)': i.s1 || i.serial_number || '',
        'S-2': i.s2 || '---',
        'S-3': i.s3 || '---',
        'S-4': i.s4 || '---',
        Material: i.material || '---',
        Valoración: i.valuation || '---',
        Estatus: resolveWarehouseStatusLabel(i.current_status),
        Caja: i.boxes?.box_code || i.boxes?.id || 'SIN CAJA',
        Tecnología: i.models?.technologies?.name || extractField(r.notes, 'Backoffice_Tech') || 'N/A',
        Marca: i.brands?.name || extractField(r.notes, 'Backoffice_Brand') || 'N/A',
        Modelo: i.models?.name || extractField(r.notes, 'Backoffice_Model') || 'N/A',
        Piloto: extractField(r.notes, 'Piloto') || 'N/A',
        Courier: r.carrier || extractField(r.notes, 'Courier') || 'REDESIS',
        Recibió: extractField(r.notes, 'Recibido Por') || r.received_by || 'SISTEMA',
        Ingreso: i.service_orders?.reentry_count ? `${i.service_orders.reentry_count}° Ingreso` : '1° Ingreso',
        Origen: r.source === 'cac' ? 'CAC' : 'PX',
        'Agencia / Proveedor':
          extractField(r.notes, 'Backoffice_Agency') || extractField(r.notes, 'Agencia') || r.carrier || '---',
      };
    });

    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
        { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 14 },
        { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Detalle Inventario');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `detalle_inventario_${today}.xlsx`);
    } catch (err) {
      console.error('Error generando Excel de inventario:', err);
    }
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
      width: '120px',
      cellClassName: 'font-bold',
      cell: (item: any) =>
        item.material ? (
          <span className="text-[#181c3a]">{item.material}</span>
        ) : (
          <span className="text-slate-300">Sin material</span>
        ),
    },
    {
      id: 'valoracion',
      header: 'Valoración',
      width: '150px',
      cell: (item: any) => {
        const raw = String(item.valuation || '').trim();
        if (!raw) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-500 border border-slate-200">
              Sin dato SAP
            </span>
          );
        }
        const isValorado = /valorado/i.test(raw) && !/novalorad|no\s*valorad/i.test(raw);
        const isNoValorado = /novalorad|no\s*valorad/i.test(raw);
        if (isValorado) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-100">
              Valorado
            </span>
          );
        }
        if (isNoValorado) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-100">
              No valorado
            </span>
          );
        }
        return <span className="text-[10px] font-medium text-slate-600">{raw}</span>;
      },
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

        <div className="flex items-center justify-between rounded-xl border-2 border-border bg-surface p-4 shadow-sm">
          <div className="relative max-w-md flex-1">
            <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar por serie, OS, caja, material..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-hover py-2 pr-4 pl-10 text-sm font-medium text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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
                <Card key={tech} className="min-w-[130px] shrink-0 rounded-2xl border-2 border-border p-6 text-center shadow-sm transition-all hover:border-accent/40">
                  <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{tech}</p>
                  <h3 className="my-3 text-4xl font-bold text-heading">{techCounts[tech] || 0}</h3>
                  <p className="text-[8px] font-semibold tracking-widest text-muted uppercase">Equipos</p>
                </Card>
              ))}
              <Card className="min-w-[140px] shrink-0 rounded-2xl border-2 border-accent/30 p-6 text-center shadow-sm transition-all">
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-accent uppercase">Total Global</p>
                <h3 className="my-3 text-4xl font-bold text-heading">{filteredItems.length}</h3>
                <p className="text-[8px] font-semibold tracking-widest text-muted uppercase">Equipos TC</p>
              </Card>
              <Card className="min-w-[140px] shrink-0 rounded-2xl border-2 border-border p-6 text-center shadow-sm transition-all">
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">Órdenes (OS)</p>
                <h3 className="my-3 text-4xl font-bold text-heading">{uniqueOs}</h3>
                <p className="text-[8px] font-semibold tracking-widest text-muted uppercase">Generadas</p>
              </Card>
            </div>
          );
        })()}

        <Card className="border-2 border-slate-100 shadow-sm overflow-visible">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando inventario...</div>
          ) : (
            <div className="w-full overflow-x-scroll overflow-y-hidden custom-scrollbar">
              <DataTable
                columns={inventarioColumns}
                data={filteredItems}
                getRowId={(_item: any, index: number) => index}
                rowHeight={64}
                maxBodyHeight={620}
                minWidth={2800}
                headerClassName="bg-[#181c3a]"
                headerTextClassName="text-white/90"
                emptyMessage="No se encontraron unidades"
              />
            </div>
          )}
        </Card>
      </div>
    </ModulePage>
  );
}
