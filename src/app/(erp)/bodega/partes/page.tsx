'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  SegmentedTabs,
  notify,
  confirmDialog,
  type DataTableColumn,
} from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { erpFieldClass, erpLabelClass, erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
import {
  AlertTriangle,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Pencil,
  Trash2,
  ScanLine,
  Send,
} from 'lucide-react';
import {
  adjustPartsStock,
  createPurchaseOrderApi,
  deleteOrRequestPartApi,
  dispatchPartRequestApi,
  dispatchPartRequestBatchApi,
  fetchPartDispatches,
  fetchPartRequests,
  fetchPartReturns,
  fetchPartsAnalytics,
  fetchPartsCatalog,
  fetchPartsInventory,
  fetchPartsMovements,
  fetchPendingReturns,
  fetchPurchaseOrders,
  receivePartReturnApi,
  receivePurchaseOrderApi,
  rejectPartRequestApi,
  savePartsCatalog,
  updatePartsLocationApi,
} from '@/lib/api/parts';
import { getBrands, getModels } from '@/shared/catalogs/catalogs';

type TabId =
  | 'inventario'
  | 'solicitudes'
  | 'despachos'
  | 'bodega_mala'
  | 'compras'
  | 'analisis'
  | 'catalogo'
  | 'historial'
  | 'alertas';

const TABS: { id: TabId; label: string }[] = [
  { id: 'inventario', label: 'Inventario' },
  { id: 'solicitudes', label: 'Solicitudes' },
  { id: 'despachos', label: 'Despachos' },
  { id: 'bodega_mala', label: 'Bodega Mala' },
  { id: 'compras', label: 'Compras' },
  { id: 'historial', label: 'Historial' },
  { id: 'analisis', label: 'Análisis' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'alertas', label: 'Alertas' },
];

const MOVEMENT_LABELS: Record<string, string> = {
  IN_PURCHASE: 'Ingreso compra',
  IN_ADJUST: 'Ingreso ajuste',
  OUT_ADJUST: 'Salida ajuste',
  RESERVE: 'Reserva',
  UNRESERVE: 'Libera reserva',
  DISPATCH: 'Despacho',
  IN_RETURN_GOOD: 'Devolución buena',
  RETURN_BAD: 'Retorno mala',
  SCRAP: 'Scrap',
  VENDOR_RETURN: 'Dev. proveedor',
};

function movementTone(type: string): 'green' | 'red' | 'yellow' | 'slate' | 'blue' {
  if (type.startsWith('IN_')) return 'green';
  if (type === 'DISPATCH' || type === 'OUT_ADJUST' || type === 'SCRAP') return 'red';
  if (type === 'RESERVE' || type === 'UNRESERVE') return 'yellow';
  if (type === 'RETURN_BAD' || type === 'VENDOR_RETURN') return 'blue';
  return 'slate';
}

function num(v: unknown): number {
  return Number(v ?? 0) || 0;
}

const tableBadgeClass = 'px-1 py-0 text-[8px] tracking-wide rounded-sm';
const tableBtnClass = '!h-6 !min-h-0 !px-1.5 !text-[8px] !rounded-md !shadow-none !border';

function osLabel(row: any): string {
  return row?.service_orders?.os_label || row?.service_order_id?.slice?.(0, 8) || '—';
}

function requestQtyNeed(request: { items?: Array<{ qty_requested?: unknown; qty_dispatched?: unknown }> } | null | undefined): number {
  return (request?.items || []).reduce((sum, item) => {
    return sum + Math.max(0, num(item.qty_requested) - num(item.qty_dispatched));
  }, 0);
}

export default function BodegaPartesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>('inventario');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [scannedSku, setScannedSku] = useState('');
  const skuScannerRef = useRef<HTMLInputElement>(null);

  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingCatalogSku, setEditingCatalogSku] = useState<string | null>(null);
  const [catalogForm, setCatalogForm] = useState({
    sku: '',
    name: '',
    category: '',
    brand_id: '',
    model_id: '',
    standard_cost: '0',
    stock_min: '0',
    reorder_point: '0',
    lead_time_days: '7',
    requires_return: true,
    active: true,
  });

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustCatalogId, setAdjustCatalogId] = useState('');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustDirection, setAdjustDirection] = useState<'IN' | 'OUT'>('IN');
  const [adjustStockType, setAdjustStockType] = useState<'NEW' | 'RECOVERED'>('NEW');
  const [adjustNotes, setAdjustNotes] = useState('');

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationCatalogId, setLocationCatalogId] = useState('');
  const [locationValue, setLocationValue] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteObs, setDeleteObs] = useState('');

  const [showPoModal, setShowPoModal] = useState(false);
  const [poForm, setPoForm] = useState({
    poNumber: '',
    supplier: '',
    catalogId: '',
    qty: '1',
    unitCost: '0',
  });

  const inventoryQuery = useQuery({
    queryKey: ['parts-inventory'],
    queryFn: fetchPartsInventory,
  });
  const catalogQuery = useQuery({
    queryKey: ['parts-catalog'],
    queryFn: () => fetchPartsCatalog({ activeOnly: false }),
  });
  const requestsQuery = useQuery({
    queryKey: ['parts-requests'],
    queryFn: () => fetchPartRequests(),
  });
  const dispatchesQuery = useQuery({
    queryKey: ['parts-dispatches'],
    queryFn: fetchPartDispatches,
  });
  const pendingReturnsQuery = useQuery({
    queryKey: ['parts-pending-returns'],
    queryFn: fetchPendingReturns,
  });
  const returnsQuery = useQuery({
    queryKey: ['parts-returns'],
    queryFn: fetchPartReturns,
  });
  const purchasesQuery = useQuery({
    queryKey: ['parts-purchases'],
    queryFn: fetchPurchaseOrders,
  });
  const analyticsQuery = useQuery({
    queryKey: ['parts-analytics'],
    queryFn: fetchPartsAnalytics,
  });
  const movementsQuery = useQuery({
    queryKey: ['parts-movements'],
    queryFn: () => fetchPartsMovements({ limit: 300 }),
  });
  const brandsQuery = useQuery({
    queryKey: ['parts-brands'],
    queryFn: async () => (await getBrands()) || [],
  });
  const modelsQuery = useQuery({
    queryKey: ['parts-models'],
    queryFn: async () => (await getModels()) || [],
  });

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['parts-inventory'] }),
      qc.invalidateQueries({ queryKey: ['parts-catalog'] }),
      qc.invalidateQueries({ queryKey: ['parts-requests'] }),
      qc.invalidateQueries({ queryKey: ['parts-dispatches'] }),
      qc.invalidateQueries({ queryKey: ['parts-pending-returns'] }),
      qc.invalidateQueries({ queryKey: ['parts-returns'] }),
      qc.invalidateQueries({ queryKey: ['parts-purchases'] }),
      qc.invalidateQueries({ queryKey: ['parts-analytics'] }),
      qc.invalidateQueries({ queryKey: ['parts-movements'] }),
    ]);
  };

  const inventory = inventoryQuery.data ?? [];
  const catalog = catalogQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const dispatches = dispatchesQuery.data ?? [];
  const pendingReturns = pendingReturnsQuery.data ?? [];
  const returns = returnsQuery.data ?? [];
  const purchases = purchasesQuery.data ?? [];
  const analytics = analyticsQuery.data;
  const movements = movementsQuery.data ?? [];
  const brands = brandsQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  const modelsForBrand = useMemo(() => {
    if (!catalogForm.brand_id) return models as any[];
    return (models as any[]).filter((m) => String(m.brand_id) === catalogForm.brand_id);
  }, [models, catalogForm.brand_id]);

  const invKpis = useMemo(() => {
    let fisico = 0;
    let reservado = 0;
    let nuevo = 0;
    let recuperado = 0;
    for (const row of inventory as any[]) {
      fisico += num(row.qty_on_hand);
      reservado += num(row.qty_reserved);
      nuevo += num(row.qty_new_on_hand);
      recuperado += num(row.qty_recovered_on_hand);
    }
    return {
      fisico,
      reservado,
      disponible: Math.max(0, fisico - reservado),
      nuevo,
      recuperado,
    };
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return (inventory as any[]).filter((r) =>
      [r.sku, r.name, r.location].filter(Boolean).some((x) => String(x).toLowerCase().includes(q))
    );
  }, [inventory, search]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return (catalog as any[]).filter((r) =>
      [r.sku, r.name, r.category].filter(Boolean).some((x) => String(x).toLowerCase().includes(q))
    );
  }, [catalog, search]);

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return movements;
    return (movements as any[]).filter((r) =>
      [
        r.sku,
        r.part_name,
        r.os_label,
        r.serial_number,
        r.created_by_name,
        r.notes,
        r.movement_type,
        r.source_type,
        MOVEMENT_LABELS[r.movement_type],
      ]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [movements, search]);

  // Una solicitud despachada, rechazada o cancelada ya no es trabajo de bodega:
  // su rastro queda en Despachos e Historial.
  const queueRequests = useMemo(
    () =>
      (requests as any[]).filter((request) =>
        ['PENDING', 'PARTIAL', 'RESERVED'].includes(String(request.status))
      ),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queueRequests;
    return queueRequests.filter((r) => {
      const hay = [
        r.request_number,
        osLabel(r),
        r.serial_number,
        r.technician_name,
        ...(r.items || []).flatMap((i: any) => [i.catalog?.sku, i.catalog?.name]),
      ];
      return hay.filter(Boolean).some((x) => String(x).toLowerCase().includes(q));
    });
  }, [queueRequests, search]);

  const requestKpis = useMemo(() => {
    const rows = queueRequests;
    const pending = rows.filter((request) =>
      ['PENDING', 'PARTIAL'].includes(String(request.status))
    ).length;
    const reserved = rows.filter((request) => String(request.status) === 'RESERVED').length;
    const urgent = rows.filter(
      (request) => request.priority === 'URGENTE'
    ).length;
    return {
      total: rows.length,
      pending,
      reserved,
      open: pending + reserved,
      urgent,
    };
  }, [queueRequests]);
  const openRequests = useMemo(
    () =>
      (filteredRequests as any[]).filter((request) =>
        ['PENDING', 'PARTIAL', 'RESERVED'].includes(String(request.status))
      ),
    [filteredRequests]
  );
  const selectedRequests = useMemo(
    () =>
      queueRequests.filter((request) => selectedRequestIds.includes(String(request.id))),
    [queueRequests, selectedRequestIds]
  );
  const selectedSkus = useMemo(
    () =>
      [
        ...new Set(
          selectedRequests
            .map((request) => request.items?.[0]?.catalog?.sku)
            .filter(Boolean)
            .map(String)
        ),
      ],
    [selectedRequests]
  );
  const selectedStock = useMemo(() => {
    const catalogId = String(selectedRequests[0]?.items?.[0]?.catalog_id || '');
    const part = (catalog as any[]).find((row) => String(row.id) === catalogId);
    const need = selectedRequests.reduce((sum, request) => sum + requestQtyNeed(request), 0);
    const availNew = num(part?.qty_new_available);
    const availRecovered = num(part?.qty_recovered_available);
    return {
      need,
      availNew,
      availRecovered,
      canNew: selectedSkus.length === 1 && availNew >= need && need > 0,
      canRecovered: selectedSkus.length === 1 && availRecovered >= need && need > 0,
    };
  }, [catalog, selectedRequests, selectedSkus]);
  const selectedRequestSku = String(
    selectedRequest?.items?.[0]?.catalog?.sku || ''
  ).trim();
  const selectedRequestStock = useMemo(() => {
    if (!selectedRequest) {
      return { need: 0, availNew: 0, availRecovered: 0, canNew: false, canRecovered: false };
    }
    const catalogId = String(selectedRequest.items?.[0]?.catalog_id || '');
    const part = (catalog as any[]).find((row) => String(row.id) === catalogId);
    const batchId = selectedRequest.batch?.id ? String(selectedRequest.batch.id) : null;
    const related = batchId
      ? (requests as any[]).filter(
          (request) =>
            String(request.batch?.id || request.batch_id || '') === batchId &&
            ['PENDING', 'PARTIAL', 'RESERVED'].includes(String(request.status))
        )
      : [selectedRequest];
    const need = related.reduce((sum, request) => sum + requestQtyNeed(request), 0);
    const availNew = num(part?.qty_new_available);
    const availRecovered = num(part?.qty_recovered_available);
    return {
      need,
      availNew,
      availRecovered,
      canNew: availNew >= need && need > 0,
      canRecovered: availRecovered >= need && need > 0,
    };
  }, [catalog, requests, selectedRequest]);
  const singleRequestStock = useMemo(() => {
    if (!selectedRequest) {
      return { need: 0, availNew: 0, availRecovered: 0, canNew: false, canRecovered: false };
    }
    const catalogId = String(selectedRequest.items?.[0]?.catalog_id || '');
    const part = (catalog as any[]).find((row) => String(row.id) === catalogId);
    const need = requestQtyNeed(selectedRequest);
    const availNew = num(part?.qty_new_available);
    const availRecovered = num(part?.qty_recovered_available);
    return {
      need,
      availNew,
      availRecovered,
      canNew: availNew >= need && need > 0,
      canRecovered: availRecovered >= need && need > 0,
    };
  }, [catalog, selectedRequest]);
  const isSelectedSkuValidated =
    selectedRequestSku.length > 0 &&
    scannedSku.trim().toUpperCase() === selectedRequestSku.toUpperCase();
  const allOpenRequestsSelected =
    openRequests.length > 0 &&
    openRequests.every((request) => selectedRequestIds.includes(String(request.id)));

  const openRequestDetail = (request: any) => {
    setSelectedRequest(request);
    setScannedSku('');
    window.setTimeout(() => skuScannerRef.current?.focus(), 50);
  };

  const inventoryCols: DataTableColumn<any>[] = [
    {
      id: 'sku',
      header: 'SKU',
      width: '88px',
      cell: (r) => <span className="font-mono text-[10px] font-bold">{r.sku || '—'}</span>,
    },
    {
      id: 'name',
      header: 'Pieza',
      width: 'minmax(100px,1.1fr)',
      cell: (r) => <span className="truncate font-semibold">{r.name || '—'}</span>,
    },
    {
      id: 'brand',
      header: 'Marca',
      width: '72px',
      cell: (r) => <span className="truncate">{r.brand_name || r.brands?.name || '—'}</span>,
    },
    {
      id: 'model',
      header: 'Modelo',
      width: '96px',
      cell: (r) => <span className="truncate">{r.model_name || r.models?.name || '—'}</span>,
    },
    {
      id: 'on_hand',
      header: 'Total',
      width: '52px',
      cell: (r) => <span className="tabular-nums font-bold">{num(r.qty_on_hand)}</span>,
    },
    {
      id: 'on_hand_new',
      header: 'Nuevo',
      width: '52px',
      cell: (r) => <span className="tabular-nums font-bold text-sky-700">{num(r.qty_new_on_hand)}</span>,
    },
    {
      id: 'on_hand_recovered',
      header: 'Recup.',
      width: '52px',
      cell: (r) => <span className="tabular-nums font-bold text-violet-700">{num(r.qty_recovered_on_hand)}</span>,
    },
    {
      id: 'reserved',
      header: 'Reserv.',
      width: '56px',
      cell: (r) => <span className="tabular-nums font-bold text-amber-600">{num(r.qty_reserved)}</span>,
    },
    {
      id: 'available',
      header: 'Disp.',
      width: '52px',
      cell: (r) => {
        const avail = num(r.qty_available ?? Math.max(0, num(r.qty_on_hand) - num(r.qty_reserved)));
        return (
          <span className={`tabular-nums font-black ${avail <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {avail}
          </span>
        );
      },
    },
    {
      id: 'location',
      header: 'Ubicación',
      width: '118px',
      cell: (r) => (
        <button
          type="button"
          className="inline-flex h-6 max-w-full items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 text-left hover:border-sky-400 hover:bg-sky-50"
          title="Editar ubicación"
          onClick={() => {
            setLocationCatalogId(r.id);
            setLocationValue(r.location || '');
            setLocationLabel(`${r.sku} · ${r.name}`);
            setShowLocationModal(true);
          }}
        >
          <Pencil className="h-3 w-3 shrink-0 text-sky-600" />
          <span className="truncate text-[10px]">{r.location || 'Sin ubicación'}</span>
        </button>
      ),
    },
    {
      id: 'actions',
      header: '',
      width: '92px',
      sticky: 'end',
      cell: (r) => (
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="outline"
            className={tableBtnClass}
            onClick={() => {
              setAdjustCatalogId(r.id);
              setAdjustQty('1');
              setAdjustDirection('IN');
              setAdjustStockType('NEW');
              setAdjustNotes('');
              setShowAdjustModal(true);
            }}
          >
            Ajuste
          </Button>
          <button
            type="button"
            className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
            title="Eliminar pieza"
            onClick={() => {
              setDeleteTarget(r);
              setDeleteReason('');
              setDeleteObs('');
              setShowDeleteModal(true);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ),
    },
  ];

  const catalogCols: DataTableColumn<any>[] = [
    { id: 'sku', header: 'SKU', width: '100px', cell: (r) => <span className="font-mono text-[11px] font-bold">{r.sku}</span> },
    { id: 'name', header: 'Nombre', width: 'minmax(120px,1fr)', cell: (r) => <span className="text-xs font-semibold">{r.name}</span> },
    { id: 'brand', header: 'Marca', width: '90px', cell: (r) => r.brands?.name || '—' },
    { id: 'model', header: 'Modelo', width: '100px', cell: (r) => r.models?.name || '—' },
    {
      id: 'cost',
      header: 'Costo',
      width: '72px',
      cell: (r) => <span className="tabular-nums">{num(r.standard_cost).toFixed(2)}</span>,
    },
    {
      id: 'min',
      header: 'Mín',
      width: '56px',
      cell: (r) => <span className="tabular-nums">{num(r.stock_min)}</span>,
    },
    {
      id: 'ret',
      header: 'Retorno',
      width: '72px',
      cell: (r) =>
        r.requires_return ? (
          <Badge variant="yellow" className={tableBadgeClass}>
            Sí
          </Badge>
        ) : (
          <Badge variant="slate" className={tableBadgeClass}>
            No
          </Badge>
        ),
    },
    {
      id: 'active',
      header: 'Estado',
      width: '80px',
      cell: (r) =>
        r.active ? (
          <Badge variant="green" className={tableBadgeClass}>
            Activo
          </Badge>
        ) : (
          <Badge variant="slate" className={tableBadgeClass}>
            Inactivo
          </Badge>
        ),
    },
    {
      id: 'edit',
      header: '',
      width: '88px',
      sticky: 'end',
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          className={`${tableBtnClass} gap-1 font-black uppercase`}
          onClick={() => openEditPart(r)}
        >
          <Pencil className="w-3 h-3" />
          Editar
        </Button>
      ),
    },
  ];

  const requestCols: DataTableColumn<any>[] = [
    {
      id: 'select',
      width: '32px',
      header: (
        <input
          type="checkbox"
          aria-label="Seleccionar todas las solicitudes abiertas"
          checked={allOpenRequestsSelected}
          onChange={(event) =>
            setSelectedRequestIds(
              event.target.checked
                ? openRequests.map((request) => String(request.id))
                : []
            )
          }
          className="h-3.5 w-3.5 accent-[var(--primary)]"
        />
      ),
      cell: (request) => (
        <input
          type="checkbox"
          aria-label={`Seleccionar solicitud ${request.request_number || request.id}`}
          checked={selectedRequestIds.includes(String(request.id))}
          disabled={!['PENDING', 'PARTIAL', 'RESERVED'].includes(String(request.status))}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            setSelectedRequestIds((current) =>
              event.target.checked
                ? [...new Set([...current, String(request.id)])]
                : current.filter((id) => id !== String(request.id))
            )
          }
          className="h-3.5 w-3.5 accent-[var(--primary)]"
        />
      ),
    },
    {
      id: 'num',
      header: 'Solicitud',
      width: '92px',
      cell: (r) => <span className="font-mono text-[10px] font-bold">{r.request_number || r.id?.slice(0, 8)}</span>,
    },
    {
      id: 'os',
      header: 'OS',
      width: '88px',
      cell: (r) => <span className="font-semibold text-[10px]">{osLabel(r)}</span>,
    },
    {
      id: 'batch',
      header: 'Lote',
      width: '128px',
      cell: (r) =>
        r.batch?.batch_number ? (
          <span
            className="max-w-full truncate font-mono text-[9px] font-bold text-sky-700"
            title={r.batch.batch_number}
          >
            {r.batch.batch_number}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--muted)]">Individual</span>
        ),
    },
    {
      id: 'sn',
      header: 'SN',
      width: 'minmax(110px,1fr)',
      cell: (r) => <span className="font-mono text-[10px] truncate">{r.serial_number || '—'}</span>,
    },
    {
      id: 'pieza',
      header: 'Pieza',
      width: 'minmax(140px,1.1fr)',
      cell: (r) => {
        const it = r.items?.[0];
        return (
          <span className="text-[10px] truncate">
            {it?.catalog?.sku || '—'} · {it?.catalog?.name || ''}
            {it ? ` ×${it.qty_requested}` : ''}
          </span>
        );
      },
    },
    {
      id: 'prio',
      header: 'Prio.',
      width: '78px',
      cell: (r) =>
        r.priority === 'URGENTE' ? (
          <Badge variant="red" className={tableBadgeClass}>
            Urgente
          </Badge>
        ) : (
          <Badge variant="slate" className={tableBadgeClass}>
            Normal
          </Badge>
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      width: '82px',
      cell: (r) => (
        <Badge variant="outline" className={tableBadgeClass}>
          {r.status}
        </Badge>
      ),
    },
    {
      id: 'act',
      header: '',
      width: '92px',
      sticky: 'end',
      cell: (r) => (
        <Button
          size="sm"
          variant="primary"
          className={`${tableBtnClass} font-black uppercase`}
          onClick={(event) => {
            event.stopPropagation();
            openRequestDetail(r);
          }}
        >
          Despachar
        </Button>
      ),
    },
  ];

  const dispatchCols: DataTableColumn<any>[] = [
    {
      id: 'num',
      header: 'Despacho',
      cell: (r) => <span className="font-mono text-[11px] font-bold">{r.dispatch_number || r.id?.slice(0, 8)}</span>,
    },
    { id: 'os', header: 'OS', cell: (r) => osLabel(r) },
    {
      id: 'items',
      header: 'Ítems',
      cell: (r) => (
        <span className="text-xs">
          {(r.items || [])
            .map(
              (i: any) =>
                `${i.catalog?.sku || '?'}×${i.qty} ${i.source_type === 'RECOVERED' ? '[Recup.]' : '[Nuevo]'}`
            )
            .join(', ') || '—'}
        </span>
      ),
    },
    {
      id: 'date',
      header: 'Fecha',
      cell: (r) =>
        r.created_at ? new Date(r.created_at).toLocaleString('es-GT') : '—',
    },
  ];

  const pendingReturnCols: DataTableColumn<any>[] = [
    {
      id: 'sku',
      header: 'SKU',
      cell: (r) => <span className="font-mono text-[11px] font-bold">{r.catalog?.sku || '—'}</span>,
    },
    { id: 'name', header: 'Pieza', cell: (r) => r.catalog?.name || '—' },
    { id: 'qty', header: 'Qty', cell: (r) => <span className="tabular-nums font-bold">{num(r.qty)}</span> },
    {
      id: 'os',
      header: 'OS',
      cell: (r) => r.dispatch?.service_orders?.os_label || r.dispatch?.service_order_id?.slice?.(0, 8) || '—',
    },
    {
      id: 'act',
      header: '',
      cell: (r) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            className={`${tableBtnClass} font-black uppercase`}
            disabled={busy}
            onClick={() => void handleReceiveReturn(r.id, 'RECEIVED')}
          >
            Recibir
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={`${tableBtnClass} font-black uppercase`}
            disabled={busy}
            onClick={() => void handleReceiveReturn(r.id, 'SCRAP')}
          >
            Scrap
          </Button>
        </div>
      ),
    },
  ];

  const purchaseCols: DataTableColumn<any>[] = [
    {
      id: 'po',
      header: 'PO',
      cell: (r) => <span className="font-mono text-[11px] font-bold">{r.po_number}</span>,
    },
    { id: 'supplier', header: 'Proveedor', cell: (r) => r.supplier || '—' },
    { id: 'status', header: 'Estado', cell: (r) => <Badge variant="outline" className={tableBadgeClass}>{r.status}</Badge> },
    {
      id: 'items',
      header: 'Ítems',
      cell: (r) =>
        (r.items || [])
          .map((i: any) => `${i.catalog?.sku}×${i.qty_ordered}`)
          .join(', ') || '—',
    },
    {
      id: 'act',
      header: '',
      cell: (r) =>
        r.status === 'OPEN' || r.status === 'PARTIAL' ? (
          <Button
            size="sm"
            className={`${tableBtnClass} font-black uppercase`}
            disabled={busy}
            onClick={() => void handleReceivePo(r.id)}
          >
            Recibir
          </Button>
        ) : null,
    },
  ];

  const movementCols: DataTableColumn<any>[] = [
    {
      id: 'when',
      header: 'Fecha',
      width: '92px',
      cell: (r) => (
        <span className="tabular-nums text-[10px]">
          {r.created_at
            ? new Date(r.created_at).toLocaleString('es-GT', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Tipo',
      width: '108px',
      cell: (r) => (
        <Badge variant={movementTone(String(r.movement_type || ''))} className={tableBadgeClass}>
          {MOVEMENT_LABELS[r.movement_type] || r.movement_type}
        </Badge>
      ),
    },
    {
      id: 'source',
      header: 'Stock',
      width: '64px',
      cell: (r) => (
        <Badge variant={r.source_type === 'RECOVERED' ? 'purple' : 'blue'} className={tableBadgeClass}>
          {r.source_type === 'RECOVERED' ? 'Recup.' : 'Nuevo'}
        </Badge>
      ),
    },
    {
      id: 'sku',
      header: 'SKU',
      width: '80px',
      cell: (r) => <span className="font-mono text-[10px] font-bold">{r.sku || '—'}</span>,
    },
    {
      id: 'pieza',
      header: 'Pieza',
      width: 'minmax(90px,1fr)',
      cell: (r) => <span className="truncate font-semibold">{r.part_name || '—'}</span>,
    },
    {
      id: 'qty',
      header: 'Cant.',
      width: '44px',
      cell: (r) => {
        const inbound = String(r.movement_type || '').startsWith('IN_');
        const sign = inbound ? '+' : String(r.movement_type) === 'UNRESERVE' ? '±' : '−';
        return (
          <span
            className={`tabular-nums font-bold ${
              inbound
                ? 'text-emerald-700'
                : String(r.movement_type) === 'RESERVE'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }`}
          >
            {sign}
            {num(r.qty)}
          </span>
        );
      },
    },
    {
      id: 'os',
      header: 'OS',
      width: '80px',
      cell: (r) => <span className="truncate font-semibold">{r.os_label || '—'}</span>,
    },
    {
      id: 'sn',
      header: 'Serie',
      width: '96px',
      cell: (r) => <span className="truncate font-mono text-[10px]">{r.serial_number || '—'}</span>,
    },
    {
      id: 'user',
      header: 'Usuario',
      width: '120px',
      cell: (r) => (
        <span className="truncate" title={r.created_by_name || ''}>
          {r.created_by_name || '—'}
        </span>
      ),
    },
    {
      id: 'notes',
      header: 'Notas',
      width: 'minmax(80px,0.8fr)',
      cell: (r) => (
        <span className="block truncate text-[var(--muted)]" title={r.notes || ''}>
          {r.notes || '—'}
        </span>
      ),
    },
  ];

  const handleSaveCatalog = async () => {
    if (!catalogForm.sku.trim() || !catalogForm.name.trim()) {
      notify.warning('SKU y nombre son obligatorios');
      return;
    }
    setBusy(true);
    const isEdit = Boolean(editingCatalogSku);
    try {
      const saved = await savePartsCatalog({
        sku: catalogForm.sku.trim().toUpperCase(),
        name: catalogForm.name.trim(),
        category: catalogForm.category || null,
        brand_id: catalogForm.brand_id || null,
        model_id: catalogForm.model_id || null,
        standard_cost: Number(catalogForm.standard_cost) || 0,
        stock_min: Number(catalogForm.stock_min) || 0,
        reorder_point: Number(catalogForm.reorder_point) || 0,
        lead_time_days: Number(catalogForm.lead_time_days) || 0,
        requires_return: catalogForm.requires_return,
        active: catalogForm.active,
      });
      notify.success(isEdit ? 'Pieza actualizada' : 'Pieza creada. Ahora carga la cantidad.');
      setShowCatalogModal(false);
      setEditingCatalogSku(null);
      await refreshAll();
      if (!isEdit) {
        const id = saved?.item?.id as string | undefined;
        if (id) {
          setAdjustCatalogId(id);
          setAdjustQty('1');
          setAdjustNotes('');
          setShowAdjustModal(true);
        }
      }
    } catch (e: any) {
      notify.error('No se pudo guardar', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const openNewPart = () => {
    setEditingCatalogSku(null);
    setCatalogForm({
      sku: '',
      name: '',
      category: '',
      brand_id: '',
      model_id: '',
      standard_cost: '0',
      stock_min: '0',
      reorder_point: '0',
      lead_time_days: '7',
      requires_return: true,
      active: true,
    });
    setShowCatalogModal(true);
  };

  const openEditPart = (row: any) => {
    setEditingCatalogSku(row.sku);
    setCatalogForm({
      sku: row.sku || '',
      name: row.name || '',
      category: row.category || '',
      brand_id: row.brand_id || '',
      model_id: row.model_id || '',
      standard_cost: String(row.standard_cost ?? 0),
      stock_min: String(row.stock_min ?? 0),
      reorder_point: String(row.reorder_point ?? 0),
      lead_time_days: String(row.lead_time_days ?? 7),
      requires_return: row.requires_return !== false,
      active: row.active !== false,
    });
    setShowCatalogModal(true);
  };

  const openLoadQty = () => {
    setAdjustCatalogId((catalog as any[]).find((c) => c.active !== false)?.id || '');
    setAdjustQty('1');
    setAdjustDirection('IN');
    setAdjustStockType('NEW');
    setAdjustNotes('');
    setShowAdjustModal(true);
  };

  const handleAdjust = async () => {
    const qty = Math.abs(Number(adjustQty));
    if (!adjustCatalogId || !Number.isFinite(qty) || qty < 1) {
      notify.warning('Indica pieza y una cantidad mayor a 0');
      return;
    }
    const qtyDelta = adjustDirection === 'OUT' ? -qty : qty;
    setBusy(true);
    try {
      await adjustPartsStock({
        catalogId: adjustCatalogId,
        qtyDelta,
        stockType: adjustStockType,
        notes: adjustNotes || undefined,
      });
      notify.success(
        adjustDirection === 'OUT'
          ? `Se restaron ${qty} de stock ${adjustStockType === 'NEW' ? 'nuevo' : 'recuperado'}`
          : `Se sumaron ${qty} a stock ${adjustStockType === 'NEW' ? 'nuevo' : 'recuperado'}`
      );
      setShowAdjustModal(false);
      await refreshAll();
    } catch (e: any) {
      notify.error('Ajuste falló', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!locationCatalogId) return;
    setBusy(true);
    try {
      await updatePartsLocationApi(locationCatalogId, locationValue.trim() || null);
      notify.success('Ubicación actualizada');
      setShowLocationModal(false);
      await refreshAll();
    } catch (e: any) {
      notify.error('No se pudo guardar ubicación', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePart = async () => {
    if (!deleteTarget?.id) return;
    const qty = num(deleteTarget.qty_on_hand);
    if (deleteReason.trim().length < 5) {
      notify.warning('Motivo obligatorio (mín. 5 caracteres)');
      return;
    }
    if (qty > 0) {
      const ok = await confirmDialog({
        title: 'Solicitar autorización',
        message: `La pieza ${deleteTarget.sku} tiene stock ${qty}. Se enviará a Autorizaciones para que el Gerente apruebe la eliminación.`,
        confirmText: 'Enviar solicitud',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await deleteOrRequestPartApi({
        catalogId: deleteTarget.id,
        reason: deleteReason.trim(),
        observations: deleteObs.trim() || undefined,
      });
      if (res.mode === 'authorization_required') {
        notify.success('Solicitud enviada a Autorizaciones', {
          description: res.message,
        });
      } else {
        notify.success('Pieza eliminada / desactivada');
      }
      setShowDeleteModal(false);
      setDeleteTarget(null);
      await refreshAll();
    } catch (e: any) {
      notify.error('No se pudo eliminar', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDispatch = async (
    requestId: string,
    sourceType: 'NEW' | 'RECOVERED'
  ) => {
    const expectedSku = String(selectedRequest?.items?.[0]?.catalog?.sku || '').trim();
    if (!expectedSku || scannedSku.trim().toUpperCase() !== expectedSku.toUpperCase()) {
      notify.warning('Pistolea el SKU correcto antes de despachar', {
        description: expectedSku ? `SKU esperado: ${expectedSku}` : 'La solicitud no tiene SKU.',
      });
      skuScannerRef.current?.focus();
      return;
    }
    if (sourceType === 'NEW' && !singleRequestStock.canNew) {
      notify.warning('Sin stock nuevo suficiente', {
        description: `Se necesitan ${singleRequestStock.need}; disponible nuevo: ${singleRequestStock.availNew}.`,
      });
      return;
    }
    if (sourceType === 'RECOVERED' && !singleRequestStock.canRecovered) {
      notify.warning('Sin stock recuperado suficiente', {
        description: `Se necesitan ${singleRequestStock.need}; disponible recuperado: ${singleRequestStock.availRecovered}.`,
      });
      return;
    }
    setBusy(true);
    try {
      await dispatchPartRequestApi(requestId, sourceType);
      notify.success('Pieza despachada · OS regresa a Reparación', {
        description: `SKU ${expectedSku} · ${sourceType === 'NEW' ? 'stock nuevo' : 'stock recuperado'} · trazabilidad registrada.`,
      });
      setSelectedRequest(null);
      setScannedSku('');
      setSelectedRequestIds((current) => current.filter((id) => id !== requestId));
      await refreshAll();
    } catch (e: any) {
      notify.error('No se pudo despachar', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDispatchSelected = async (sourceType: 'NEW' | 'RECOVERED') => {
    if (selectedRequests.length === 0) return;
    if (selectedSkus.length !== 1) {
      notify.warning('La selección contiene SKU diferentes', {
        description: 'Selecciona solicitudes de la misma pieza para despacharlas juntas.',
      });
      return;
    }
    const expectedSku = selectedSkus[0];
    if (scannedSku.trim().toUpperCase() !== expectedSku.toUpperCase()) {
      notify.warning('Pistolea el SKU del lote antes de despachar', {
        description: `SKU esperado: ${expectedSku}`,
      });
      skuScannerRef.current?.focus();
      return;
    }
    if (sourceType === 'NEW' && !selectedStock.canNew) {
      notify.warning('Sin stock nuevo suficiente', {
        description: `Se necesitan ${selectedStock.need}; disponible nuevo: ${selectedStock.availNew}.`,
      });
      return;
    }
    if (sourceType === 'RECOVERED' && !selectedStock.canRecovered) {
      notify.warning('Sin stock recuperado suficiente', {
        description: `Se necesitan ${selectedStock.need}; disponible recuperado: ${selectedStock.availRecovered}.`,
      });
      return;
    }

    setBusy(true);
    const succeeded: string[] = [];
    const failed: Array<{ request: any; message: string }> = [];
    for (const request of selectedRequests) {
      try {
        await dispatchPartRequestApi(String(request.id), sourceType);
        succeeded.push(String(request.id));
      } catch (error: unknown) {
        failed.push({
          request,
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }
    setBusy(false);
    setSelectedRequestIds((current) => current.filter((id) => !succeeded.includes(id)));
    setScannedSku('');
    await refreshAll();
    if (failed.length > 0) {
      notify.warning('Despacho múltiple procesado parcialmente', {
        description: `${succeeded.length} despachadas; ${failed.length} pendientes. ${failed[0]?.message || ''}`,
      });
    } else {
      notify.success(`${succeeded.length} solicitudes despachadas`, {
        description: `SKU ${expectedSku} descontado y trazado individualmente por OS.`,
      });
    }
  };

  const handleDispatchBatch = async (
    batchId: string,
    sourceType: 'NEW' | 'RECOVERED'
  ) => {
    const expectedSku = String(selectedRequest?.items?.[0]?.catalog?.sku || '').trim();
    if (!expectedSku || scannedSku.trim().toUpperCase() !== expectedSku.toUpperCase()) {
      notify.warning('Pistolea el SKU correcto antes de despachar el lote', {
        description: expectedSku ? `SKU esperado: ${expectedSku}` : 'El lote no tiene SKU.',
      });
      skuScannerRef.current?.focus();
      return;
    }
    if (sourceType === 'NEW' && !selectedRequestStock.canNew) {
      notify.warning('Sin stock nuevo suficiente para el lote', {
        description: `Se necesitan ${selectedRequestStock.need}; disponible nuevo: ${selectedRequestStock.availNew}.`,
      });
      return;
    }
    if (sourceType === 'RECOVERED' && !selectedRequestStock.canRecovered) {
      notify.warning('Sin stock recuperado suficiente para el lote', {
        description: `Se necesitan ${selectedRequestStock.need}; disponible recuperado: ${selectedRequestStock.availRecovered}.`,
      });
      return;
    }
    setBusy(true);
    try {
      const result = await dispatchPartRequestBatchApi(batchId, sourceType);
      if (result.errors.length > 0) {
        notify.warning(`Lote ${result.batchNumber} despachado parcialmente`, {
          description: `${result.dispatched.length} OS despachadas; ${result.errors.length} pendientes.`,
        });
      } else {
        notify.success(`Lote ${result.batchNumber} despachado`, {
          description: `${result.dispatched.length} órdenes procesadas con trazabilidad individual.`,
        });
      }
      setSelectedRequest(null);
      setScannedSku('');
      setSelectedRequestIds([]);
      await refreshAll();
    } catch (e: any) {
      notify.error('No se pudo despachar el lote', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setBusy(true);
    try {
      await rejectPartRequestApi(requestId, 'Rechazado desde Bodega de Partes');
      notify.success('Solicitud rechazada');
      setSelectedRequest(null);
      await refreshAll();
    } catch (e: any) {
      notify.error('No se pudo rechazar', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleReceiveReturn = async (dispatchItemId: string, status: string) => {
    setBusy(true);
    try {
      await receivePartReturnApi(dispatchItemId, status);
      notify.success(status === 'SCRAP' ? 'Marcado como scrap' : 'Retorno recibido');
      await refreshAll();
    } catch (e: any) {
      notify.error('Retorno falló', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePo = async () => {
    if (!poForm.poNumber.trim() || !poForm.catalogId) {
      notify.warning('PO y pieza son obligatorios');
      return;
    }
    setBusy(true);
    try {
      await createPurchaseOrderApi({
        poNumber: poForm.poNumber.trim(),
        supplier: poForm.supplier || null,
        items: [
          {
            catalogId: poForm.catalogId,
            qty: Number(poForm.qty) || 1,
            unitCost: Number(poForm.unitCost) || 0,
          },
        ],
      });
      notify.success('Orden de compra creada');
      setShowPoModal(false);
      await refreshAll();
    } catch (e: any) {
      notify.error('No se pudo crear PO', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleReceivePo = async (poId: string) => {
    setBusy(true);
    try {
      await receivePurchaseOrderApi(poId);
      notify.success('Recepción aplicada a inventario');
      await refreshAll();
    } catch (e: any) {
      notify.error('Recepción falló', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModulePage
      category="Bodega"
      title="Bodega de Partes"
      subtitle="Catálogo, inventario, solicitudes de taller, retornos y compras"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void refreshAll()}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refrescar
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              setTab('inventario');
              openLoadQty();
            }}
          >
            <Package className="w-3.5 h-3.5" />
            Cargar repuesto
          </Button>
          {tab === 'catalogo' && (
            <Button size="sm" className="h-9 gap-1.5" onClick={openNewPart}>
              <Plus className="w-3.5 h-3.5" />
              Nueva pieza
            </Button>
          )}
          {tab === 'compras' && (
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowPoModal(true)}>
              <ShoppingCart className="w-3.5 h-3.5" />
              Nueva PO
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-2">
        <SegmentedTabs
          items={TABS}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          className="flex-wrap"
          triggerClassName="text-[10px]"
        />

        <ModuleToolbar
          onSearch={setSearch}
          searchValue={search}
          searchPlaceholder="Buscar SKU, OS, SN…"
        />

        {tab === 'inventario' && (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
            <div className="space-y-2 lg:col-span-4">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <Kpi label="Stock total" value={invKpis.fisico} compact />
                <Kpi label="Stock nuevo" value={invKpis.nuevo} tone="blue" compact />
                <Kpi label="Stock recuperado" value={invKpis.recuperado} tone="purple" compact />
                <Kpi label="Reservado" value={invKpis.reservado} tone="amber" compact />
                <Kpi label="Disponible" value={invKpis.disponible} tone="emerald" compact />
              </div>
              <Card className="overflow-hidden p-0">
                <div className={`${erpTableHeader} px-2.5 py-1.5`}>
                  <span className={erpTableHeaderText}>Inventario de piezas</span>
                </div>
                <DataTable
                  columns={inventoryCols}
                  data={filteredInventory as any[]}
                  getRowId={(r) => r.id}
                  compact
                  rowHeight={32}
                  minWidth={920}
                  emptyMessage={
                    inventoryQuery.isLoading
                      ? 'Cargando…'
                      : 'Sin piezas todavía. Usa el panel de la derecha → Nueva pieza.'
                  }
                />
              </Card>
            </div>
            <Card className="sticky top-4 h-fit space-y-2 p-3 lg:col-span-1">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                Acciones
              </h3>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                1) Crea la pieza (SKU). 2) Carga la cantidad al inventario.
              </p>
              <Button className="w-full h-10 gap-1.5 text-[10px] font-black uppercase" onClick={openNewPart}>
                <Plus className="w-4 h-4" />
                Nueva pieza
              </Button>
              <Button
                variant="outline"
                className="w-full h-10 gap-1.5 text-[10px] font-black uppercase"
                onClick={openLoadQty}
                disabled={(catalog as any[]).filter((c) => c.active !== false).length === 0}
              >
                <Package className="w-4 h-4" />
                Cargar cantidad
              </Button>
              {(catalog as any[]).filter((c) => c.active !== false).length === 0 && (
                <p className="text-[10px] text-amber-600 font-semibold">
                  Primero crea al menos una pieza para poder cargar stock.
                </p>
              )}
            </Card>
          </div>
        )}

        {tab === 'solicitudes' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="En cola" value={requestKpis.total} compact />
              <Kpi label="Pendientes" value={requestKpis.pending} tone="amber" compact />
              <Kpi label="Reservadas" value={requestKpis.reserved} tone="blue" compact />
              <Kpi label="Urgentes abiertas" value={requestKpis.urgent} tone="rose" compact />
            </div>
            <Card className="overflow-hidden p-0">
              <div className={`${erpTableHeader} px-2.5 py-1.5`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className={erpTableHeaderText}>Cola de solicitudes</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">
                    {requestKpis.open} abiertas · {requestKpis.pending} pendientes · {selectedRequests.length} seleccionada(s)
                  </span>
                </div>
              </div>
              {selectedRequests.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] bg-sky-50/70 px-2.5 py-1.5">
                  <div className="relative min-w-[220px] flex-1">
                    <ScanLine className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-600" />
                    <input
                      ref={skuScannerRef}
                      className={`${erpFieldClass} h-8 pl-7 font-mono text-[11px] uppercase`}
                      value={scannedSku}
                      onChange={(event) => setScannedSku(event.target.value)}
                      placeholder={
                        selectedSkus.length === 1
                          ? `1) Pistolear SKU: ${selectedSkus[0]}`
                          : 'Selecciona solicitudes del mismo SKU'
                      }
                      autoComplete="off"
                      aria-label="Pistolear SKU para selección"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8 gap-1 px-2 text-[8px] font-black uppercase"
                    disabled={busy || !selectedStock.canNew}
                    title={
                      selectedStock.canNew
                        ? `Stock nuevo disponible: ${selectedStock.availNew}`
                        : `Sin stock nuevo suficiente (disp. ${selectedStock.availNew} / need ${selectedStock.need})`
                    }
                    onClick={() => void handleDispatchSelected('NEW')}
                  >
                    <Send className="h-3 w-3" />
                    Nuevo ({selectedRequests.length} · {selectedStock.availNew})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 px-2 text-[8px] font-black uppercase"
                    disabled={busy || !selectedStock.canRecovered}
                    title={
                      selectedStock.canRecovered
                        ? `Stock recuperado disponible: ${selectedStock.availRecovered}`
                        : `Sin stock recuperado suficiente (disp. ${selectedStock.availRecovered} / need ${selectedStock.need})`
                    }
                    onClick={() => void handleDispatchSelected('RECOVERED')}
                  >
                    <Send className="h-3 w-3" />
                    Recuperado ({selectedRequests.length} · {selectedStock.availRecovered})
                  </Button>
                </div>
              )}
              <DataTable
                columns={requestCols}
                data={filteredRequests as any[]}
                getRowId={(r) => r.id}
                compact
                rowHeight={32}
                minWidth={920}
                onRowClick={(request) => openRequestDetail(request)}
                rowClassName={(request) =>
                  selectedRequestIds.includes(String(request.id)) ? 'bg-sky-50' : undefined
                }
                emptyMessage={requestsQuery.isLoading ? 'Cargando…' : 'Sin solicitudes abiertas'}
              />
            </Card>
            {selectedRequest && (
              <button
                type="button"
                aria-label="Cerrar despacho"
                className="fixed inset-0 z-40 bg-slate-950/45"
                onClick={() => {
                  setSelectedRequest(null);
                  setScannedSku('');
                }}
              />
            )}
            <Card
              className={`space-y-3 p-4 ${
                selectedRequest
                  ? 'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto shadow-2xl'
                  : 'hidden'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider">Despachar solicitud</h3>
                <button
                  type="button"
                  aria-label="Cerrar"
                  className="rounded-md px-2 py-1 text-lg leading-none text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setSelectedRequest(null);
                    setScannedSku('');
                  }}
                >
                  ×
                </button>
              </div>
              {!selectedRequest ? (
                <p className="text-sm text-[var(--muted)]">Selecciona una solicitud.</p>
              ) : (
                <>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-[var(--muted)]">OS </span>
                      <strong>{osLabel(selectedRequest)}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--muted)]">Series </span>
                      {selectedRequest.serial_numbers?.length
                        ? selectedRequest.serial_numbers.join(' · ')
                        : selectedRequest.serial_number || '—'}
                    </div>
                    {selectedRequest.batch?.batch_number && (
                      <div>
                        <span className="text-[var(--muted)]">Lote </span>
                        <strong>{selectedRequest.batch.batch_number}</strong>
                        {' · '}
                        {selectedRequest.batch.total_orders} OS
                      </div>
                    )}
                    <div>
                      <span className="text-[var(--muted)]">Estado </span>
                      {selectedRequest.status}
                    </div>
                    <div>
                      <span className="text-[var(--muted)]">Motivo </span>
                      {selectedRequest.reason || '—'}
                    </div>
                  </div>
                  <label className="block space-y-1 border-t border-[var(--border)] pt-3">
                    <span className={erpLabelClass}>Confirmar pieza con pistola *</span>
                    <div className="relative">
                      <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-600" />
                      <input
                        ref={skuScannerRef}
                        className={`${erpFieldClass} pl-8 font-mono uppercase ${
                          scannedSku
                            ? isSelectedSkuValidated
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-rose-500 bg-rose-50'
                            : ''
                        }`}
                        value={scannedSku}
                        onChange={(event) => setScannedSku(event.target.value)}
                        placeholder={`Pistolear SKU ${selectedRequestSku || ''}`}
                        autoFocus
                        autoComplete="off"
                      />
                    </div>
                    <p
                      className={`text-[10px] font-semibold ${
                        isSelectedSkuValidated ? 'text-emerald-600' : 'text-[var(--muted)]'
                      }`}
                    >
                      {isSelectedSkuValidated
                        ? `SKU ${selectedRequestSku} validado`
                        : 'El despacho se habilita únicamente al leer el SKU solicitado.'}
                    </p>
                  </label>
                  <div className="space-y-2 border-t border-[var(--border)] pt-2">
                    {(selectedRequest.items || []).map((it: any) => {
                      const cat = catalog.find((c: any) => c.id === it.catalog_id) as any;
                      const avail = cat?.qty_available ?? '—';
                      const availNew = cat?.qty_new_available ?? 0;
                      const availRecovered = cat?.qty_recovered_available ?? 0;
                      return (
                        <div key={it.id} className="rounded-lg border border-[var(--border)] p-2 text-xs space-y-2">
                          <div className="font-semibold">
                            {it.catalog?.sku} · {it.catalog?.name}
                          </div>
                          <div className="flex justify-between text-[var(--muted)]">
                            <span>Solicitado: {it.qty_requested}</span>
                            <span>Disp.: {avail}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-[var(--muted)]">
                            <span>Nuevo: {availNew}</span>
                            <span>Recuperado: {availRecovered}</span>
                          </div>
                          <div className="text-[10px] uppercase font-bold text-[var(--muted)]">
                            Ítem: {it.status}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    {['PENDING', 'PARTIAL', 'RESERVED'].includes(String(selectedRequest.status)) && (
                      selectedRequest.batch?.id ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            className="h-9 text-[9px] font-black uppercase"
                            disabled={busy || !isSelectedSkuValidated || !selectedRequestStock.canNew}
                            title={
                              selectedRequestStock.canNew
                                ? `Stock nuevo: ${selectedRequestStock.availNew}`
                                : `Sin stock nuevo (disp. ${selectedRequestStock.availNew} / need ${selectedRequestStock.need})`
                            }
                            onClick={() =>
                              void handleDispatchBatch(selectedRequest.batch.id, 'NEW')
                            }
                          >
                            Lote nuevo ({selectedRequest.batch.total_orders} · {selectedRequestStock.availNew})
                          </Button>
                          <Button
                            variant="outline"
                            className="h-9 text-[9px] font-black uppercase"
                            disabled={busy || !isSelectedSkuValidated || !selectedRequestStock.canRecovered}
                            title={
                              selectedRequestStock.canRecovered
                                ? `Stock recuperado: ${selectedRequestStock.availRecovered}`
                                : `Sin stock recuperado (disp. ${selectedRequestStock.availRecovered} / need ${selectedRequestStock.need})`
                            }
                            onClick={() =>
                              void handleDispatchBatch(selectedRequest.batch.id, 'RECOVERED')
                            }
                          >
                            Lote recuperado ({selectedRequest.batch.total_orders} · {selectedRequestStock.availRecovered})
                          </Button>
                          <Button
                            variant="outline"
                            className="h-9 text-[9px] font-black uppercase"
                            disabled={busy || !isSelectedSkuValidated || !singleRequestStock.canNew}
                            title={
                              singleRequestStock.canNew
                                ? `Stock nuevo: ${singleRequestStock.availNew}`
                                : `Sin stock nuevo (disp. ${singleRequestStock.availNew} / need ${singleRequestStock.need})`
                            }
                            onClick={() => void handleDispatch(selectedRequest.id, 'NEW')}
                          >
                            Solo esta OS · nuevo
                          </Button>
                          <Button
                            variant="outline"
                            className="h-9 text-[9px] font-black uppercase"
                            disabled={busy || !isSelectedSkuValidated || !singleRequestStock.canRecovered}
                            title={
                              singleRequestStock.canRecovered
                                ? `Stock recuperado: ${singleRequestStock.availRecovered}`
                                : `Sin stock recuperado (disp. ${singleRequestStock.availRecovered} / need ${singleRequestStock.need})`
                            }
                            onClick={() => void handleDispatch(selectedRequest.id, 'RECOVERED')}
                          >
                            Solo esta OS · recuperado
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            className="h-9 text-[9px] font-black uppercase"
                            disabled={busy || !isSelectedSkuValidated || !selectedRequestStock.canNew}
                            title={
                              selectedRequestStock.canNew
                                ? `Stock nuevo: ${selectedRequestStock.availNew}`
                                : `Sin stock nuevo (disp. ${selectedRequestStock.availNew} / need ${selectedRequestStock.need})`
                            }
                            onClick={() => void handleDispatch(selectedRequest.id, 'NEW')}
                          >
                            Despachar nuevo ({selectedRequestStock.availNew})
                          </Button>
                          <Button
                            variant="outline"
                            className="h-9 text-[9px] font-black uppercase"
                            disabled={busy || !isSelectedSkuValidated || !selectedRequestStock.canRecovered}
                            title={
                              selectedRequestStock.canRecovered
                                ? `Stock recuperado: ${selectedRequestStock.availRecovered}`
                                : `Sin stock recuperado (disp. ${selectedRequestStock.availRecovered} / need ${selectedRequestStock.need})`
                            }
                            onClick={() => void handleDispatch(selectedRequest.id, 'RECOVERED')}
                          >
                            Despachar recuperado ({selectedRequestStock.availRecovered})
                          </Button>
                        </div>
                      )
                    )}
                    {['PENDING', 'PARTIAL'].includes(String(selectedRequest.status)) && (
                      <Button
                        variant="outline"
                        className="h-9 text-[10px] font-black uppercase text-rose-600"
                        disabled={busy}
                        onClick={() => void handleReject(selectedRequest.id)}
                      >
                        Rechazar
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          </div>
        )}

        {tab === 'despachos' && (
          <Card className="overflow-hidden p-0">
            <div className={`${erpTableHeader} px-2.5 py-1.5`}>
              <span className={erpTableHeaderText}>Histórico de despachos</span>
            </div>
            <DataTable
              columns={dispatchCols}
              data={dispatches as any[]}
              getRowId={(r) => r.id}
              compact
              rowHeight={32}
              emptyMessage={dispatchesQuery.isLoading ? 'Cargando…' : 'Sin despachos'}
            />
          </Card>
        )}

        {tab === 'bodega_mala' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Retornos pendientes" value={pendingReturns.length} tone="amber" />
              <Kpi label="Retornos registrados" value={returns.length} />
            </div>
            <Card className="overflow-hidden p-0">
              <div className={`${erpTableHeader} px-2.5 py-1.5`}>
                <span className={erpTableHeaderText}>Pendientes de retorno (pieza mala)</span>
              </div>
              <DataTable
                columns={pendingReturnCols}
                data={pendingReturns as any[]}
                getRowId={(r) => r.id}
                compact
                rowHeight={32}
                emptyMessage={
                  pendingReturnsQuery.isLoading ? 'Cargando…' : 'Sin retornos pendientes'
                }
              />
            </Card>
          </div>
        )}

        {tab === 'compras' && (
          <Card className="overflow-hidden p-0">
            <div className={`${erpTableHeader} px-2.5 py-1.5`}>
              <span className={erpTableHeaderText}>Órdenes de compra</span>
            </div>
            <DataTable
              columns={purchaseCols}
              data={purchases as any[]}
              getRowId={(r) => r.id}
              compact
              rowHeight={32}
              emptyMessage={purchasesQuery.isLoading ? 'Cargando…' : 'Sin POs'}
            />
          </Card>
        )}

        {tab === 'historial' && (
          <Card className="overflow-hidden p-0">
            <div className={`${erpTableHeader} px-2.5 py-1.5`}>
              <span className={erpTableHeaderText}>
                Historial de movimientos · ingresos, ajustes, reservas, despachos y retornos
              </span>
            </div>
            <DataTable
              columns={movementCols}
              data={filteredMovements as any[]}
              getRowId={(r) => r.id}
              compact
              rowHeight={32}
              minWidth={900}
              emptyMessage={
                movementsQuery.isLoading
                  ? 'Cargando…'
                  : 'Sin movimientos. Aparecen al cargar cantidad, ajustar, reservar o despachar.'
              }
            />
          </Card>
        )}

        {tab === 'analisis' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="p-3 space-y-2">
              <h3 className="text-xs font-black uppercase">Consumo (despachos × costo)</h3>
              <div className="max-h-80 overflow-auto space-y-1">
                {(analytics?.consumption || []).map((c: any) => (
                  <div key={c.sku} className="flex justify-between text-xs border-b border-[var(--border)] py-1.5">
                    <span>
                      <span className="font-mono font-bold">{c.sku}</span> {c.name}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {c.qty} · Q{num(c.cost).toFixed(2)}
                    </span>
                  </div>
                ))}
                {!analytics?.consumption?.length && (
                  <p className="text-sm text-[var(--muted)]">Sin consumo registrado</p>
                )}
              </div>
            </Card>
            <Card className="p-3 space-y-2">
              <h3 className="text-xs font-black uppercase">Compras vs consumo</h3>
              <div className="max-h-80 overflow-auto space-y-1">
                {(analytics?.purchases || []).map((c: any) => (
                  <div key={c.sku} className="flex justify-between text-xs border-b border-[var(--border)] py-1.5">
                    <span>
                      <span className="font-mono font-bold">{c.sku}</span> {c.name}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {c.qty} · Q{num(c.cost).toFixed(2)}
                    </span>
                  </div>
                ))}
                {!analytics?.purchases?.length && (
                  <p className="text-sm text-[var(--muted)]">Sin compras registradas</p>
                )}
              </div>
            </Card>
            <Card className="lg:col-span-2 p-3 space-y-2">
              <h3 className="text-xs font-black uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Reorden sugerido
              </h3>
              <div className="max-h-64 overflow-auto space-y-1">
                {(analytics?.reorderAlerts || []).map((a: any) => (
                  <div key={a.catalog_id} className="flex justify-between text-xs border-b border-[var(--border)] py-1.5">
                    <span>
                      <span className="font-mono font-bold">{a.sku}</span> · disp {a.qty_available} / mín{' '}
                      {a.stock_min}
                    </span>
                    <span className="font-black text-amber-600">Pedir {a.suggested_qty}</span>
                  </div>
                ))}
                {!analytics?.reorderAlerts?.length && (
                  <p className="text-sm text-[var(--muted)]">Sin alertas de reorden</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === 'catalogo' && (
          <Card className="overflow-hidden p-0">
            <div className={`${erpTableHeader} px-2.5 py-1.5`}>
              <span className={erpTableHeaderText}>Catálogo de piezas</span>
            </div>
            <DataTable
              columns={catalogCols}
              data={filteredCatalog as any[]}
              getRowId={(r) => r.id}
              compact
              rowHeight={32}
              minWidth={860}
              emptyMessage={
                catalogQuery.isLoading
                  ? 'Cargando…'
                  : 'Vacío. Usa «Nueva pieza» arriba a la derecha para crear el SKU.'
              }
            />
          </Card>
        )}

        {tab === 'alertas' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
              <Kpi label="OS esperando" value={analytics?.alerts?.os_waiting ?? 0} tone="amber" />
              <Kpi label="Sin stock" value={analytics?.alerts?.requests_without_stock ?? 0} tone="rose" />
              <Kpi label="Retornos pend." value={analytics?.alerts?.returns_pending ?? 0} tone="amber" />
              <Kpi label="No recibidas" value={analytics?.alerts?.parts_not_received ?? 0} tone="rose" />
              <Kpi label="Bajo mínimo" value={analytics?.alerts?.below_min ?? 0} tone="rose" />
              <Kpi label="SKUs reservados" value={analytics?.alerts?.reserved_skus ?? 0} />
            </div>
            {(analytics?.notReceived || []).length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className={`${erpTableHeader} px-2.5 py-1.5`}>
                  <span className={erpTableHeaderText}>Casos: taller no recibió la pieza</span>
                </div>
                <ul className="divide-y divide-[var(--border)] text-xs">
                  {(analytics.notReceived as any[]).map((row) => (
                    <li key={row.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span className="font-semibold">
                        <span className="font-mono">{row.catalog?.sku || '—'}</span>
                        {row.catalog?.name ? ` · ${row.catalog.name}` : ''}
                      </span>
                      <span className="text-[var(--muted)]">
                        {row.dispatch?.service_orders?.os_label || 'OS'}
                        {row.dispatch?.dispatch_number ? ` · ${row.dispatch.dispatch_number}` : ''}
                        {row.receipt_confirmed_by_name ? ` · ${row.receipt_confirmed_by_name}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>

      {showCatalogModal && (
        <Modal
          title={editingCatalogSku ? 'Editar pieza / condiciones' : 'Nueva pieza (SKU)'}
          onClose={() => {
            setShowCatalogModal(false);
            setEditingCatalogSku(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU *">
              <input
                className={erpFieldClass}
                value={catalogForm.sku}
                disabled={Boolean(editingCatalogSku)}
                onChange={(e) => setCatalogForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="Nombre *">
              <input
                className={erpFieldClass}
                value={catalogForm.name}
                onChange={(e) => setCatalogForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Categoría">
              <input
                className={erpFieldClass}
                value={catalogForm.category}
                onChange={(e) => setCatalogForm((f) => ({ ...f, category: e.target.value }))}
              />
            </Field>
            <Field label="Costo estándar">
              <input
                type="number"
                className={erpFieldClass}
                value={catalogForm.standard_cost}
                onChange={(e) => setCatalogForm((f) => ({ ...f, standard_cost: e.target.value }))}
              />
            </Field>
            <Field label="Marca">
              <select
                className={erpFieldClass}
                value={catalogForm.brand_id}
                onChange={(e) =>
                  setCatalogForm((f) => ({ ...f, brand_id: e.target.value, model_id: '' }))
                }
              >
                <option value="">—</option>
                {(brands as any[]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modelo">
              <select
                className={erpFieldClass}
                value={catalogForm.model_id}
                onChange={(e) => setCatalogForm((f) => ({ ...f, model_id: e.target.value }))}
              >
                <option value="">—</option>
                {modelsForBrand.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stock mínimo">
              <input
                type="number"
                className={erpFieldClass}
                value={catalogForm.stock_min}
                onChange={(e) => setCatalogForm((f) => ({ ...f, stock_min: e.target.value }))}
              />
            </Field>
            <Field label="Punto de reorden">
              <input
                type="number"
                className={erpFieldClass}
                value={catalogForm.reorder_point}
                onChange={(e) => setCatalogForm((f) => ({ ...f, reorder_point: e.target.value }))}
              />
            </Field>
            <Field label="Lead time (días)">
              <input
                type="number"
                className={erpFieldClass}
                value={catalogForm.lead_time_days}
                onChange={(e) => setCatalogForm((f) => ({ ...f, lead_time_days: e.target.value }))}
              />
            </Field>
            <Field label="Requiere retorno">
              <label className="flex items-center gap-2 text-sm h-10">
                <input
                  type="checkbox"
                  checked={catalogForm.requires_return}
                  onChange={(e) =>
                    setCatalogForm((f) => ({ ...f, requires_return: e.target.checked }))
                  }
                />
                Pieza mala → Bodega Mala
              </label>
            </Field>
            {editingCatalogSku && (
              <Field label="Estado">
                <label className="flex items-center gap-2 text-sm h-10">
                  <input
                    type="checkbox"
                    checked={catalogForm.active}
                    onChange={(e) => setCatalogForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Pieza activa
                </label>
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowCatalogModal(false);
                setEditingCatalogSku(null);
              }}
            >
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void handleSaveCatalog()}>
              {editingCatalogSku ? 'Guardar cambios' : 'Guardar y cargar cantidad'}
            </Button>
          </div>
        </Modal>
      )}

      {showAdjustModal && (
        <Modal title="Ajustar inventario" onClose={() => setShowAdjustModal(false)}>
          {(() => {
            const part = (catalog as any[]).find((c) => c.id === adjustCatalogId);
            const qty = Math.abs(Number(adjustQty)) || 0;
            const signed = adjustDirection === 'OUT' ? -qty : qty;
            const currentNew = num(part?.qty_new_on_hand);
            const currentRec = num(part?.qty_recovered_on_hand);
            const nextNew = adjustStockType === 'NEW' ? currentNew + signed : currentNew;
            const nextRec = adjustStockType === 'RECOVERED' ? currentRec + signed : currentRec;
            const nextTotal = nextNew + nextRec;
            return (
          <>
          <p className="text-xs text-[var(--muted)] mb-3">
            El total es la suma de Nuevo + Recuperado. Elige si sumas o restas, y sobre qué tipo de stock.
          </p>
          <div className="space-y-3">
            <Field label="Pieza del catálogo">
              <select
                className={erpFieldClass}
                value={adjustCatalogId}
                onChange={(e) => setAdjustCatalogId(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {(catalog as any[])
                  .filter((c) => c.active !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sku} · {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            {part && (
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                <div>
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">Total</div>
                  <div className="text-lg font-black tabular-nums">{num(part.qty_on_hand)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase text-sky-600">Nuevo</div>
                  <div className="text-lg font-black tabular-nums text-sky-700">{currentNew}</div>
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase text-violet-600">Recup.</div>
                  <div className="text-lg font-black tabular-nums text-violet-700">{currentRec}</div>
                </div>
              </div>
            )}
            <Field label="Operación">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={adjustDirection === 'IN' ? 'primary' : 'outline'}
                  className="h-10 text-[10px] font-black uppercase"
                  onClick={() => setAdjustDirection('IN')}
                >
                  Sumar
                </Button>
                <Button
                  type="button"
                  variant={adjustDirection === 'OUT' ? 'primary' : 'outline'}
                  className="h-10 text-[10px] font-black uppercase"
                  onClick={() => setAdjustDirection('OUT')}
                >
                  Restar
                </Button>
              </div>
            </Field>
            <Field label="Cantidad">
              <input
                type="number"
                min={1}
                step={1}
                className={erpFieldClass}
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value.replace(/-/g, ''))}
              />
            </Field>
            <Field label="Ajustar sobre">
              <select
                className={erpFieldClass}
                value={adjustStockType}
                onChange={(e) => setAdjustStockType(e.target.value as 'NEW' | 'RECOVERED')}
              >
                <option value="NEW">Stock nuevo</option>
                <option value="RECOVERED">Stock recuperado</option>
              </select>
            </Field>
            {part && qty > 0 && (
              <p className={`rounded-md px-2.5 py-2 text-[10px] font-semibold ${
                nextNew < 0 || nextRec < 0
                  ? 'border border-rose-200 bg-rose-50 text-rose-700'
                  : 'border border-sky-200 bg-sky-50 text-sky-800'
              }`}>
                Resultado: Total {nextTotal} · Nuevo {nextNew} · Recup. {nextRec}
              </p>
            )}
            <Field label="Notas">
              <input
                className={erpFieldClass}
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                placeholder="Motivo del ajuste…"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAdjustModal(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !adjustCatalogId} onClick={() => void handleAdjust()}>
              {adjustDirection === 'OUT' ? 'Restar del inventario' : 'Sumar al inventario'}
            </Button>
          </div>
          </>
            );
          })()}
        </Modal>
      )}

      {showLocationModal && (
        <Modal title="Ubicación de pieza" onClose={() => setShowLocationModal(false)}>
          <p className="text-xs text-[var(--muted)] mb-3 font-semibold">{locationLabel}</p>
          <Field label="Ubicación (rack / anaquel / bin)">
            <input
              className={erpFieldClass}
              value={locationValue}
              placeholder="Ej. A-01-03"
              onChange={(e) => setLocationValue(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowLocationModal(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void handleSaveLocation()}>
              Guardar ubicación
            </Button>
          </div>
        </Modal>
      )}

      {showDeleteModal && deleteTarget && (
        <Modal title="Eliminar pieza" onClose={() => setShowDeleteModal(false)}>
          <div className="space-y-3">
            <p className="text-xs">
              <span className="font-mono font-bold">{deleteTarget.sku}</span> · {deleteTarget.name}
            </p>
            {num(deleteTarget.qty_on_hand) > 0 ? (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Stock físico: {num(deleteTarget.qty_on_hand)}. No se elimina al instante: se crea
                solicitud en <strong>Autorizaciones</strong> para el Gerente General.
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Sin stock: la pieza se desactiva de inmediato.
              </p>
            )}
            <Field label="Motivo * (mín. 5 caracteres)">
              <input
                className={erpFieldClass}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Obsoleto, error de alta, etc."
              />
            </Field>
            <Field label="Observaciones">
              <input
                className={erpFieldClass}
                value={deleteObs}
                onChange={(e) => setDeleteObs(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancelar
            </Button>
            <Button
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => void handleDeletePart()}
            >
              {num(deleteTarget.qty_on_hand) > 0 ? 'Solicitar eliminación' : 'Eliminar'}
            </Button>
          </div>
        </Modal>
      )}

      {showPoModal && (
        <Modal title="Nueva orden de compra" onClose={() => setShowPoModal(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PO *">
              <input
                className={erpFieldClass}
                value={poForm.poNumber}
                onChange={(e) => setPoForm((f) => ({ ...f, poNumber: e.target.value }))}
              />
            </Field>
            <Field label="Proveedor">
              <input
                className={erpFieldClass}
                value={poForm.supplier}
                onChange={(e) => setPoForm((f) => ({ ...f, supplier: e.target.value }))}
              />
            </Field>
            <Field label="Pieza *">
              <select
                className={erpFieldClass}
                value={poForm.catalogId}
                onChange={(e) => setPoForm((f) => ({ ...f, catalogId: e.target.value }))}
              >
                <option value="">Seleccionar…</option>
                {(catalog as any[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sku} · {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cantidad">
              <input
                type="number"
                className={erpFieldClass}
                value={poForm.qty}
                onChange={(e) => setPoForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </Field>
            <Field label="Costo unitario">
              <input
                type="number"
                className={erpFieldClass}
                value={poForm.unitCost}
                onChange={(e) => setPoForm((f) => ({ ...f, unitCost: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowPoModal(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void handleCreatePo()}>
              Crear PO
            </Button>
          </div>
        </Modal>
      )}
    </ModulePage>
  );
}

function Kpi({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: number;
  tone?: 'amber' | 'emerald' | 'rose' | 'blue' | 'purple';
  compact?: boolean;
}) {
  const color =
    tone === 'amber'
      ? 'text-amber-600'
      : tone === 'emerald'
        ? 'text-emerald-600'
        : tone === 'rose'
          ? 'text-rose-600'
          : tone === 'blue'
            ? 'text-sky-600'
            : tone === 'purple'
              ? 'text-violet-600'
          : 'text-[var(--foreground)]';
  return (
    <Card className={compact ? 'px-2.5 py-1.5' : 'p-3'}>
      <div className="text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className={`${compact ? 'text-xl' : 'text-2xl'} font-black tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={erpLabelClass}>{label}</span>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black uppercase tracking-wide">{title}</h3>
          <button type="button" className="text-[var(--muted)] text-xs font-bold" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
