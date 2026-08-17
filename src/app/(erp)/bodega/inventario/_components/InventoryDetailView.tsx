"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Card,
  Badge,
  Button,
  DataTable,
  TablePagination,
  type DataTableColumn,
} from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { Search, Download, ArrowLeft, Filter, X } from 'lucide-react';
import Link from 'next/link';
import { getInventoryDetails, getScrapInventoryDetails, resolveWarehouseStatusLabel } from '@/modules/inventario/client/inventoryQueries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import {
  catalogLabelKey,
  catalogModelKey,
  normalizeCatalogLabel,
  stripBrandFromModelName,
  stripKnownBrandsFromModelName,
} from '@/shared/catalogs/normalizeCatalogName';
import { InventoryTableToolbar } from './InventoryTableToolbar';
import { InventoryTableSkeleton } from './InventoryTableSkeleton';

const EMPTY_ITEMS: any[] = [];
const PAGE_SIZE = 25;

export type InventoryDetailVariant = 'central' | 'scraps';

type TableDensity = 'compact' | 'normal' | 'comfortable';

const DENSITY_CONFIG: Record<
  TableDensity,
  { rowHeight: number; baseBodyHeight: number; compact: boolean; label: string }
> = {
  compact: { rowHeight: 36, baseBodyHeight: 480, compact: true, label: 'Compacto' },
  normal: { rowHeight: 40, baseBodyHeight: 520, compact: true, label: 'Normal' },
  comfortable: { rowHeight: 44, baseBodyHeight: 560, compact: false, label: 'Amplio' },
};

function plainCell(value: string, muted = false) {
  return (
    <span
      className={`block truncate whitespace-nowrap text-xs font-medium ${muted ? 'text-slate-400' : 'text-slate-700'}`}
      title={value}
    >
      {value}
    </span>
  );
}

function extractField(notes: string, fieldKey: string) {
  if (!notes) return '';
  const normalizedNotes = notes.replace(/\\n/g, '\n');
  // Solo valor de la línea (evita tragarse Backoffice_Category / otros keys)
  const lineRe = new RegExp(`(?:^|\\n)\\s*${fieldKey}:\\s*([^\\n]+)`, 'i');
  const lineMatch = normalizedNotes.match(lineRe);
  if (lineMatch?.[1]) return lineMatch[1].trim();
  const regex = new RegExp(
    fieldKey + ':\\s*(.*?)(?=\\s+[A-Za-z_][A-Za-z0-9_]*:|\\s*---|\\s*$)',
    'i'
  );
  const match = normalizedNotes.match(regex);
  return match ? match[1].trim() : '';
}

function isBogusAgencyValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return (
    v.includes('backoffice_categor') ||
    v.includes('backoffice_tech') ||
    v.includes('backoffice_brand') ||
    v.includes('backoffice_model') ||
    /^(tel[eé]fono|accesorio|equipo|m[oó]vil|movil)s?$/.test(v)
  );
}

/** Agencia CAC de ingreso: guía → notes Backoffice_Agency → serie. Nunca categoría ni courier. */
function resolveAgencyLabel(item: {
  notes?: string | null;
  receptions?: {
    notes?: string | null;
    carrier?: string | null;
    source?: string | null;
    reception_guides?: { agency?: string | null } | { agency?: string | null }[] | null;
  } | null;
}): string {
  const r = item.receptions || {};
  const carrier = r.carrier || null;
  const guides = Array.isArray(r.reception_guides)
    ? r.reception_guides
    : r.reception_guides
      ? [r.reception_guides]
      : [];

  for (const g of guides) {
    const fromGuide = sanitizeCacAgencyRaw(g?.agency, carrier);
    if (fromGuide && !isBogusAgencyValue(fromGuide)) return fromGuide;
  }

  const fromBackoffice = sanitizeCacAgencyRaw(
    extractField(r.notes || '', 'Backoffice_Agency'),
    carrier
  );
  if (fromBackoffice && !isBogusAgencyValue(fromBackoffice)) return fromBackoffice;

  const seriesNotes = String(item.notes || '').replace(/\\n/g, '\n');
  const fromSeries = sanitizeCacAgencyRaw(
    seriesNotes.split('Agencia: ')[1]?.split('|')[0]?.split('\n')[0]?.trim(),
    carrier
  );
  if (fromSeries && !isBogusAgencyValue(fromSeries)) return fromSeries;

  const fromAgencia = sanitizeCacAgencyRaw(extractField(r.notes || '', 'Agencia'), carrier);
  if (fromAgencia && !isBogusAgencyValue(fromAgencia)) return fromAgencia;

  return '---';
}

function resolveItemTech(item: {
  models?: { technologies?: { name?: string | null } | null; name?: string | null } | null;
  receptions?: { notes?: string | null } | null;
}): string {
  return normalizeCatalogLabel(
    item.models?.technologies?.name ||
      extractField(item.receptions?.notes || '', 'Backoffice_Tech') ||
      ''
  );
}

function resolveItemModel(item: {
  models?: { name?: string | null } | null;
  brands?: { name?: string | null } | null;
  receptions?: { notes?: string | null } | null;
}): string {
  const raw = normalizeCatalogLabel(
    item.models?.name || extractField(item.receptions?.notes || '', 'Backoffice_Model') || ''
  );
  const brand = normalizeCatalogLabel(
    item.brands?.name || extractField(item.receptions?.notes || '', 'Backoffice_Brand') || ''
  );
  return stripBrandFromModelName(raw, brand);
}

const TECH_CARD_OPTIONS = ['ADSL', 'DTH', 'EMTA', 'IPTV', 'ONT', 'STB-HFC', 'WTTH'] as const;

function resolveItemBrand(item: {
  brands?: { name?: string | null } | null;
  receptions?: { notes?: string | null } | null;
}): string {
  return normalizeCatalogLabel(
    item.brands?.name || extractField(item.receptions?.notes || '', 'Backoffice_Brand') || ''
  );
}

export default function InventoryDetailView({
  variant = 'central',
}: {
  variant?: InventoryDetailVariant;
}) {
  const isScraps = variant === 'scraps';
  const backHref = isScraps ? '/bodega/scraps' : '/bodega/gestion';
  const title = isScraps ? 'Detalle de Inventario SCRAPS' : 'Detalle de Inventario';
  const subtitle = isScraps
    ? 'Equipos TC en cajas SCRAP (irreparables). Incluye diagnóstico, motivo SCRAPS, caja BOX-BAD-… y ubicación.'
    : 'Vista a nivel de equipo TC (OS) con validación SAP, Material y Valoración.';

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const [filterTech, setFilterTech] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [density, setDensity] = useState<TableDensity>('normal');
  const [tableExpanded, setTableExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const hScrollRef = useRef<HTMLDivElement>(null);

  const scrollHorizontal = useCallback((dir: -1 | 1) => {
    hScrollRef.current?.scrollBy({ left: dir * 380, behavior: 'smooth' });
  }, []);

  const cycleDensity = useCallback((dir: -1 | 1) => {
    const order: TableDensity[] = ['compact', 'normal', 'comfortable'];
    setDensity((prev) => {
      const idx = order.indexOf(prev);
      const next = Math.min(order.length - 1, Math.max(0, idx + dir));
      return order[next]!;
    });
  }, []);

  const densityCfg = DENSITY_CONFIG[density];
  const maxBodyHeight = tableExpanded ? 820 : densityCfg.baseBodyHeight;

  const inventoryQuery = useQuery({
    queryKey: ['inventory-details', variant],
    queryFn: async () => {
      const result: any = isScraps ? await getScrapInventoryDetails() : await getInventoryDetails();
      if (result?.error) throw new Error(result.error);
      return (result?.data ?? []) as any[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
  const items = inventoryQuery.data ?? EMPTY_ITEMS;
  const showSkeleton = inventoryQuery.isLoading && !inventoryQuery.data;
  const isFetching = inventoryQuery.isFetching && !!inventoryQuery.data;

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
        Estatus: isScraps ? 'SCRAPS' : resolveWarehouseStatusLabel(i.current_status),
        Diagnóstico: Array.isArray(i.diagnostic_labels)
          ? i.diagnostic_labels.join(' · ')
          : i.scrap_reason || '',
        'Motivo SCRAPS': i.scrap_reason || '',
        Caja: i.boxes?.box_code || i.boxes?.id || 'SIN CAJA',
        Ubicación: i.boxes?.rack_location || '---',
        Tecnología: i.models?.technologies?.name || extractField(r.notes, 'Backoffice_Tech') || 'N/A',
        Marca: i.brands?.name || extractField(r.notes, 'Backoffice_Brand') || 'N/A',
        Modelo: i.models?.name || extractField(r.notes, 'Backoffice_Model') || 'N/A',
        Piloto: extractField(r.notes, 'Piloto') || 'N/A',
        Courier: r.carrier || extractField(r.notes, 'Courier') || 'REDESIS',
        Recibió: extractField(r.notes, 'Recibido Por') || r.received_by || 'SISTEMA',
        Ingreso: i.service_orders?.reentry_count ? `${i.service_orders.reentry_count}° Ingreso` : '1° Ingreso',
        Origen: r.source === 'cac' ? 'CAC' : 'PX',
        'Agencia / Proveedor': resolveAgencyLabel(i),
      };
    });

    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
        { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 22 },
        { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 14 },
        { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      const sheetName = isScraps ? 'Inventario SCRAPS' : 'Detalle Inventario';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const today = new Date().toISOString().slice(0, 10);
      const filePrefix = isScraps ? 'detalle_inventario_scraps' : 'detalle_inventario';
      XLSX.writeFile(wb, `${filePrefix}_${today}.xlsx`);
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
      const diagLabels = new Set<string>();
      for (const r of ordered) {
        for (const label of r.diagnostic_labels || []) {
          if (label) diagLabels.add(String(label));
        }
        if (r.scrap_reason && !(r.diagnostic_labels || []).length) {
          diagLabels.add(String(r.scrap_reason));
        }
      }
      const scrapReason =
        [...diagLabels].join(' · ') ||
        primary?.scrap_reason ||
        (isScraps ? 'Sin diagnóstico registrado' : '');
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
        diagnostic_labels: [...diagLabels],
        scrap_reason: scrapReason,
      };
    });

    return [...mergedGroups, ...ungrouped];
  }, [items, isScraps]);

  const searchFilteredItems = useMemo(() => {
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
        (i.scrap_reason || '').toLowerCase().includes(s) ||
        (Array.isArray(i.diagnostic_labels)
          ? i.diagnostic_labels.join(' ').toLowerCase().includes(s)
          : false) ||
        resolveItemTech(i).toLowerCase().includes(s) ||
        resolveItemBrand(i).toLowerCase().includes(s) ||
        resolveItemModel(i).toLowerCase().includes(s)
      );
    });
  }, [groupedItems, debouncedSearch]);

  const techFilterOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const tech of TECH_CARD_OPTIONS) {
      byKey.set(catalogLabelKey(tech), tech);
    }
    for (const i of searchFilteredItems) {
      const name = resolveItemTech(i);
      const key = catalogLabelKey(name);
      if (!key || key === 'N/A') continue;
      if (!byKey.has(key)) byKey.set(key, name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [searchFilteredItems]);

  const brandFilterOptions = useMemo(() => {
    const techKey = catalogLabelKey(filterTech);
    const byKey = new Map<string, string>();
    for (const i of searchFilteredItems) {
      if (techKey && catalogLabelKey(resolveItemTech(i)) !== techKey) continue;
      const name = resolveItemBrand(i);
      const key = catalogLabelKey(name);
      if (!key || key === 'N/A') continue;
      if (!byKey.has(key)) byKey.set(key, name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [searchFilteredItems, filterTech]);

  /** Marcas del alcance (tech) para limpiar prefijos/sufijos en nombres de modelo. */
  const brandNamesInScope = useMemo(() => {
    const techKey = catalogLabelKey(filterTech);
    const names = new Set<string>();
    for (const i of searchFilteredItems) {
      if (techKey && catalogLabelKey(resolveItemTech(i)) !== techKey) continue;
      const brand = resolveItemBrand(i);
      if (brand && brand !== 'N/A') names.add(brand);
    }
    if (filterBrand) names.add(filterBrand);
    return [...names];
  }, [searchFilteredItems, filterTech, filterBrand]);

  const resolveCleanModel = useCallback(
    (item: Parameters<typeof resolveItemModel>[0]) => {
      const raw = normalizeCatalogLabel(
        item.models?.name || extractField(item.receptions?.notes || '', 'Backoffice_Model') || ''
      );
      const brand = resolveItemBrand(item);
      return stripKnownBrandsFromModelName(stripBrandFromModelName(raw, brand), brandNamesInScope);
    },
    [brandNamesInScope]
  );

  const modelFilterOptions = useMemo(() => {
    const techKey = catalogLabelKey(filterTech);
    const brandKey = catalogLabelKey(filterBrand);
    const byKey = new Map<string, string>();
    for (const i of searchFilteredItems) {
      if (techKey && catalogLabelKey(resolveItemTech(i)) !== techKey) continue;
      if (brandKey && catalogLabelKey(resolveItemBrand(i)) !== brandKey) continue;
      const name = resolveCleanModel(i);
      const key = catalogModelKey(name, undefined, brandNamesInScope) || catalogLabelKey(name);
      if (!key || key === 'NA') continue;
      const existing = byKey.get(key);
      if (!existing || name.length < existing.length) byKey.set(key, name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [searchFilteredItems, filterTech, filterBrand, resolveCleanModel, brandNamesInScope]);

  const filteredItems = useMemo(() => {
    const techKey = catalogLabelKey(filterTech);
    const brandKey = catalogLabelKey(filterBrand);
    const modelKey =
      catalogModelKey(filterModel, filterBrand, brandNamesInScope) || catalogLabelKey(filterModel);
    return searchFilteredItems.filter((i) => {
      if (techKey && catalogLabelKey(resolveItemTech(i)) !== techKey) return false;
      if (brandKey && catalogLabelKey(resolveItemBrand(i)) !== brandKey) return false;
      if (modelKey) {
        const itemKey =
          catalogModelKey(resolveCleanModel(i), undefined, brandNamesInScope) ||
          catalogLabelKey(resolveCleanModel(i));
        if (itemKey !== modelKey) return false;
      }
      return true;
    });
  }, [searchFilteredItems, filterTech, filterBrand, filterModel, brandNamesInScope, resolveCleanModel]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterTech, filterBrand, filterModel]);

  useEffect(() => {
    if (filterBrand && !brandFilterOptions.some((n) => catalogLabelKey(n) === catalogLabelKey(filterBrand))) {
      setFilterBrand('');
    }
  }, [filterBrand, brandFilterOptions]);

  useEffect(() => {
    if (
      filterModel &&
      !modelFilterOptions.some(
        (n) =>
          (catalogModelKey(n, filterBrand, brandNamesInScope) || catalogLabelKey(n)) ===
          (catalogModelKey(filterModel, filterBrand, brandNamesInScope) || catalogLabelKey(filterModel))
      )
    ) {
      setFilterModel('');
    }
  }, [filterModel, modelFilterOptions, filterBrand, brandNamesInScope]);

  const clearCatalogFilters = useCallback(() => {
    setFilterTech('');
    setFilterBrand('');
    setFilterModel('');
  }, []);

  const setTechFilter = useCallback((next: string) => {
    setFilterTech(next);
    setFilterBrand('');
    setFilterModel('');
  }, []);

  const totalCount = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(page, totalPages);
  const startItem = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, totalCount);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const inventarioColumns = useMemo<DataTableColumn<any>[]>(() => [
    {
      id: 'fecha',
      header: 'Fecha / Hora',
      width: '132px',
      cell: (item: any) =>
        plainCell(item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'),
    },
    {
      id: 'guia',
      header: 'No. Guía',
      width: '100px',
      cell: (item: any) => plainCell((item.receptions || {}).guide_number || 'PX'),
    },
    {
      id: 'os',
      header: 'Orden Servicio',
      width: '100px',
      cell: (item: any) =>
        plainCell(item.service_orders?.os_label || '---'),
    },
    {
      id: 'val_sap',
      header: 'Val. SAP',
      width: '120px',
      cell: (item: any) => {
        const status = String(item.unitSapValidationStatus || 'Pendiente Validación');
        const dots = Array.isArray(item.seriesSapStatuses)
          ? item.seriesSapStatuses
              .map((s: string, i: number) => {
                const ok = /validado/i.test(String(s || ''));
                return `S${i + 1}:${ok ? 'OK' : 'Pend'}`;
              })
              .slice(0, 4)
              .join(' ')
          : '';
        const label = dots ? `${status} · ${dots}` : status;
        return plainCell(label);
      },
    },
    {
      id: 's1',
      header: 'S-1 (SAP)',
      width: '120px',
      cell: (item: any) => plainCell(String(item.s1 || item.serial_number || '---')),
    },
    {
      id: 's2',
      header: 'S-2',
      width: '100px',
      cell: (item: any) => plainCell(String(item.s2 || '---'), !item.s2 || item.s2 === '---'),
    },
    {
      id: 's3',
      header: 'S-3',
      width: '100px',
      cell: (item: any) => plainCell(String(item.s3 || '---'), !item.s3 || item.s3 === '---'),
    },
    {
      id: 's4',
      header: 'S-4',
      width: '100px',
      cell: (item: any) => plainCell(String(item.s4 || '---'), !item.s4 || item.s4 === '---'),
    },
    {
      id: 'material',
      header: 'Material',
      width: '110px',
      cell: (item: any) => plainCell(item.material ? String(item.material) : 'Sin material', !item.material),
    },
    {
      id: 'valoracion',
      header: 'Valoración',
      width: '110px',
      cell: (item: any) => {
        const raw = String(item.valuation || '').trim();
        if (!raw) return plainCell('Sin dato SAP', true);
        const isValorado = /valorado/i.test(raw) && !/novalorad|no\s*valorad/i.test(raw);
        const isNoValorado = /novalorad|no\s*valorad/i.test(raw);
        if (isValorado) return plainCell('Valorado');
        if (isNoValorado) return plainCell('No valorado');
        return plainCell(raw);
      },
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '120px',
      cell: (item: any) =>
        plainCell(
          isScraps
            ? 'SCRAPS'
            : resolveWarehouseStatusLabel(item.current_status)
        ),
    },
    ...(isScraps
      ? [
          {
            id: 'diagnostico',
            header: 'Diagnóstico',
            width: '180px',
            cell: (item: any) => {
              const labels = Array.isArray(item.diagnostic_labels)
                ? item.diagnostic_labels
                : [];
              const text =
                labels.length > 0
                  ? labels.join(' · ')
                  : item.scrap_reason || 'Sin diagnóstico';
              return plainCell(text);
            },
          } as DataTableColumn<any>,
          {
            id: 'motivo_scrap',
            header: 'Motivo SCRAPS',
            width: '160px',
            cell: (item: any) =>
              plainCell(item.scrap_reason || 'Marcado irreparable / scrap'),
          } as DataTableColumn<any>,
        ]
      : []),
    {
      id: 'caja',
      header: 'Caja',
      width: '110px',
      cell: (item: any) => plainCell(item.boxes?.box_code || item.boxes?.id || 'SIN CAJA'),
    },
    ...(isScraps
      ? [
          {
            id: 'ubicacion',
            header: 'Ubicación',
            width: '140px',
            cell: (item: any) => plainCell(item.boxes?.rack_location || 'SCRAP'),
          } as DataTableColumn<any>,
        ]
      : []),
    {
      id: 'tecnologia',
      header: 'Tecnología',
      width: '90px',
      cell: (item: any) =>
        plainCell(
          item.models?.technologies?.name ||
            extractField((item.receptions || {}).notes, 'Backoffice_Tech') ||
            'N/A'
        ),
    },
    {
      id: 'marca',
      header: 'Marca',
      width: '90px',
      cell: (item: any) =>
        plainCell(
          item.brands?.name || extractField((item.receptions || {}).notes, 'Backoffice_Brand') || 'N/A'
        ),
    },
    {
      id: 'modelo',
      header: 'Modelo',
      width: '120px',
      cell: (item: any) =>
        plainCell(
          item.models?.name || extractField((item.receptions || {}).notes, 'Backoffice_Model') || 'N/A'
        ),
    },
    {
      id: 'piloto',
      header: 'Piloto',
      width: '100px',
      cell: (item: any) => plainCell(extractField((item.receptions || {}).notes, 'Piloto') || 'N/A'),
    },
    {
      id: 'courier',
      header: 'Courier',
      width: '110px',
      cell: (item: any) => {
        const r = item.receptions || {};
        return plainCell(r.carrier || extractField(r.notes, 'Courier') || 'REDESIS');
      },
    },
    {
      id: 'recibio',
      header: 'Recibió',
      width: '140px',
      cell: (item: any) => {
        const r = item.receptions || {};
        const name = extractField(r.notes, 'Recibido Por') || r.received_by || 'SISTEMA';
        return plainCell(String(name));
      },
    },
    {
      id: 'ingreso',
      header: 'Ingreso',
      width: '80px',
      cell: (item: any) =>
        plainCell(
          item.service_orders?.reentry_count
            ? `${item.service_orders.reentry_count}° Ingreso`
            : '1° Ingreso'
        ),
    },
    {
      id: 'origen',
      header: 'Origen',
      width: '60px',
      cell: (item: any) => plainCell((item.receptions || {}).source === 'cac' ? 'CAC' : 'PX'),
    },
    {
      id: 'agencia',
      header: 'Agencia / Proveedor',
      width: '150px',
      cell: (item: any) => plainCell(resolveAgencyLabel(item)),
    },
  ], [isScraps]);

  const techStats = useMemo(() => {
    const technologies = [...TECH_CARD_OPTIONS];
    const techCounts = technologies.reduce((acc, tech) => {
      const techKey = catalogLabelKey(tech);
      acc[tech] = searchFilteredItems.filter(
        (i) => catalogLabelKey(resolveItemTech(i)) === techKey
      ).length;
      return acc;
    }, {} as Record<string, number>);
    const uniqueOs = new Set(filteredItems.map(i => i.service_orders?.os_label).filter(Boolean)).size;
    const uniqueBoxes = new Set(
      filteredItems
        .map((i) => String(i.boxes?.box_code || i.boxes?.id || '').trim())
        .filter((c) => c && c !== 'SIN CAJA')
    ).size;
    // Ocultar techs en 0 para no parecer "duplicados" vacíos (STB-HFC / WTTH, etc.).
    const visibleTechnologies = technologies.filter((tech) => (techCounts[tech] || 0) > 0);
    return { technologies: visibleTechnologies, techCounts, uniqueOs, uniqueBoxes };
  }, [searchFilteredItems, filteredItems]);

  return (
    <ModulePage
      title=""
      subtitle=""
      category="Bodega"
    >
      <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6 lg:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2 md:mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link href={backHref}>
                <Button variant="outline" size="sm" className="h-7 px-2 text-slate-500 hover:text-[#181c3a] border-slate-200">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Regresar
                </Button>
              </Link>
              <Badge variant={isScraps ? 'red' : 'purple'}>{isScraps ? 'SCRAPS' : 'BODEGA'}</Badge>
            </div>
            <h1 className="text-2xl font-black text-[#181c3a] tracking-tight">{title}</h1>
            <p className="text-sm text-slate-500 font-medium">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border-2 border-border bg-surface p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between lg:p-4">
          <div className="flex w-full min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-0 w-full max-w-md flex-1">
              <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Buscar por serie, OS, caja, material..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-hover py-2 pr-4 pl-10 text-sm font-medium text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>

            <div className="relative w-full shrink-0 sm:w-40">
              <Filter className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <select
                value={filterTech}
                onChange={(e) => setTechFilter(e.target.value)}
                aria-label="Filtrar por tecnología"
                className="h-10 w-full appearance-none rounded-lg border border-border bg-surface-hover py-2 pr-8 pl-8 text-xs font-bold text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Toda tecnología</option>
                {techFilterOptions.map((name) => (
                  <option key={catalogLabelKey(name)} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full shrink-0 sm:w-40">
              <Filter className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <select
                value={filterBrand}
                onChange={(e) => {
                  setFilterBrand(e.target.value);
                  setFilterModel('');
                }}
                aria-label="Filtrar por marca"
                disabled={!filterTech && brandFilterOptions.length === 0}
                className="h-10 w-full appearance-none rounded-lg border border-border bg-surface-hover py-2 pr-8 pl-8 text-xs font-bold text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
              >
                <option value="">Todas las marcas</option>
                {brandFilterOptions.map((name) => (
                  <option key={catalogLabelKey(name)} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {filterBrand ? (
                <button
                  type="button"
                  title="Quitar filtro de marca"
                  onClick={() => {
                    setFilterBrand('');
                    setFilterModel('');
                  }}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-heading"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="relative w-full shrink-0 sm:w-48">
              <Filter className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <select
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                aria-label="Filtrar por modelo"
                className="h-10 w-full appearance-none rounded-lg border border-border bg-surface-hover py-2 pr-8 pl-8 text-xs font-bold text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Todos los modelos</option>
                {modelFilterOptions.map((name) => (
                  <option key={catalogModelKey(name, filterBrand, brandNamesInScope) || catalogLabelKey(name)} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {filterModel ? (
                <button
                  type="button"
                  title="Quitar filtro de modelo"
                  onClick={() => setFilterModel('')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-heading"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {(filterTech || filterBrand || filterModel) && (
              <button
                type="button"
                onClick={clearCatalogFilters}
                className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#181c3a]"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button onClick={exportToExcel} className="bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider">
              <Download className="w-4 h-4 mr-2" /> Exportar a Excel
            </Button>
          </div>
        </div>

        {(() => {
          const { technologies, techCounts, uniqueOs, uniqueBoxes } = techStats;

          return (
            <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
              {technologies.map(tech => {
                const active = catalogLabelKey(filterTech) === catalogLabelKey(tech);
                return (
                  <button
                    key={tech}
                    type="button"
                    onClick={() => {
                      setTechFilter(
                        catalogLabelKey(filterTech) === catalogLabelKey(tech) ? '' : tech
                      );
                    }}
                    className="text-left"
                    title={active ? 'Quitar filtro de tecnología' : `Filtrar por ${tech}`}
                  >
                    <Card
                      className={`min-w-[130px] shrink-0 rounded-2xl border-2 p-6 text-center shadow-sm transition-all ${
                        active
                          ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                          : 'border-border hover:border-accent/40'
                      }`}
                    >
                      <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{tech}</p>
                      <h3 className="my-3 text-4xl font-bold text-heading">{techCounts[tech] || 0}</h3>
                      <p className="text-[8px] font-semibold tracking-widest text-muted uppercase">Equipos</p>
                    </Card>
                  </button>
                );
              })}
              <Card className="min-w-[140px] shrink-0 rounded-2xl border-2 border-accent/30 p-6 text-center shadow-sm transition-all">
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-accent uppercase">
                  {isScraps ? 'Equipos filtrados' : 'Total filtrado'}
                </p>
                <h3 className="my-3 text-4xl font-bold text-heading">{filteredItems.length}</h3>
                <p className="text-[8px] font-semibold tracking-widest text-muted uppercase">Equipos TC</p>
              </Card>
              <Card className="min-w-[140px] shrink-0 rounded-2xl border-2 border-border p-6 text-center shadow-sm transition-all">
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
                  {isScraps ? 'Cajas SCRAP' : 'Órdenes (OS)'}
                </p>
                <h3 className="my-3 text-4xl font-bold text-heading">
                  {isScraps ? uniqueBoxes : uniqueOs}
                </h3>
                <p className="text-[8px] font-semibold tracking-widest text-muted uppercase">
                  {isScraps ? 'En inventario' : 'Generadas'}
                </p>
              </Card>
            </div>
          );
        })()}

        <Card className="overflow-hidden border border-slate-200 shadow-sm">
          <InventoryTableToolbar
            densityLabel={densityCfg.label}
            density={density}
            tableExpanded={tableExpanded}
            isFetching={isFetching}
            onScrollLeft={() => scrollHorizontal(-1)}
            onScrollRight={() => scrollHorizontal(1)}
            onZoomOut={() => cycleDensity(-1)}
            onZoomIn={() => cycleDensity(1)}
            onToggleExpand={() => setTableExpanded((v) => !v)}
          />

          {showSkeleton ? (
            <InventoryTableSkeleton />
          ) : inventoryQuery.isError ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm font-semibold text-slate-700">No se pudo cargar el inventario</p>
              <p className="text-xs text-slate-500">
                {(inventoryQuery.error as Error)?.message || 'Error de red'}
              </p>
              <Button variant="outline" size="sm" onClick={() => inventoryQuery.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : (
            <>
              <div
                ref={hScrollRef}
                className="w-full overflow-x-auto overflow-y-hidden [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100"
              >
                <DataTable
                  columns={inventarioColumns}
                  data={pageItems}
                  getRowId={(item: any, index: number) =>
                    item.service_order_id || item.id || `${safePage}-${index}`
                  }
                  rowHeight={densityCfg.rowHeight}
                  maxBodyHeight={maxBodyHeight}
                  minWidth={2800}
                  compact={densityCfg.compact}
                  virtualizeThreshold={50}
                  headerClassName="bg-[#181c3a]"
                  headerTextClassName="text-white/90"
                  emptyMessage="No se encontraron unidades"
                />
              </div>
              <TablePagination
                totalCount={totalCount}
                page={safePage}
                totalPages={totalPages}
                startItem={startItem}
                endItem={endItem}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemLabel="equipos (OS)"
              />
            </>
          )}
        </Card>
      </div>
    </ModulePage>
  );
}
