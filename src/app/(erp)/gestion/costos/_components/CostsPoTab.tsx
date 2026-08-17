'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  Badge,
  Button,
  Card,
  DataTable,
  notify,
  confirmDialog,
  promptDialog,
  type DataTableColumn,
} from '@/components/ui';
import { Edit3, FileSpreadsheet, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import {
  COST_PO_IVA_RATE,
  COST_PO_STATUSES,
  calcPoLineTotals,
  deleteCostPoLine,
  getCostPoLines,
  importCostPoLines,
  saveCostPoLine,
  type CostPoLine,
  type CostPoLineInput,
} from '@/modules/finance-costing/client/costs';

const EMPTY: CostPoLine[] = [];

/** Headers exactos de la plantilla Excel operativa (Costos → PO). */
const PO_TEMPLATE_HEADERS = [
  'Modelo',
  'Tecnolog',
  'Tipos Acciones',
  'Descripcion',
  'Estatus',
  'Cantidad',
  'Precio unitario',
] as const;

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const formatPoDate = (raw: string | null) => {
  if (!raw) return '—';
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: '2-digit' });
};

const emptyForm = (): CostPoLineInput => ({
  po_number: '',
  po_date: new Date().toISOString().slice(0, 10),
  sku: '',
  description: '',
  technology: '',
  action_type: '',
  status: 'Pendiente de PO/ en Proceso',
  unit_price: 0,
  quantity: 0,
});

function normalizeHeader(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const hit = entries.find(([k]) => normalizeHeader(k) === target);
    if (hit && hit[1] != null && String(hit[1]).trim() !== '') return hit[1];
  }
  // partial contains
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const hit = entries.find(([k]) => normalizeHeader(k).includes(target));
    if (hit && hit[1] != null && String(hit[1]).trim() !== '') return hit[1];
  }
  return undefined;
}

function excelDateToIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const y = parsed.y;
    const m = String(parsed.m).padStart(2, '0');
    const d = String(parsed.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  // 26-may / 26-jul / 26/5/2026
  const monthMap: Record<string, string> = {
    ene: '01',
    jan: '01',
    feb: '02',
    mar: '03',
    abr: '04',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    ago: '08',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dic: '12',
    dec: '12',
  };
  const short = raw.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})(?:[-\/\s](\d{2,4}))?$/i);
  if (short) {
    const day = short[1].padStart(2, '0');
    const mon = monthMap[short[2].slice(0, 3).toLowerCase()];
    let year = short[3] ? Number(short[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (mon) return `${year}-${mon}-${day}`;
  }
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString().slice(0, 10);
  return null;
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '')
    .replace(/[$\s]/g, '')
    .replace(/,/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function mapExcelRowToPoLine(
  row: Record<string, unknown>,
  defaults?: { po_number?: string; po_date?: string | null }
): CostPoLineInput | null {
  const modelo = String(
    pickField(row, ['Modelo', 'SKU', 'sku', 'Codigo', 'Código']) ?? ''
  ).trim();
  const description = String(
    pickField(row, ['Descripcion', 'Descripción', 'description', 'Producto']) ?? ''
  ).trim();
  if (!modelo && !description) return null;

  const po = String(
    pickField(row, ['PO', 'po_number', 'Orden', 'Orden de compra']) ?? defaults?.po_number ?? ''
  ).trim();

  const statusRaw = String(
    pickField(row, ['Estatus', 'Status', 'Estado']) ?? 'Pendiente de PO/ en Proceso'
  ).trim();
  const status =
    COST_PO_STATUSES.find((s) => normalizeHeader(s) === normalizeHeader(statusRaw)) ||
    statusRaw ||
    'Pendiente de PO/ en Proceso';

  return {
    po_number: po,
    po_date:
      excelDateToIso(pickField(row, ['Date', 'Fecha', 'po_date'])) || defaults?.po_date || null,
    sku: modelo || null,
    description: description || modelo,
    technology:
      String(
        pickField(row, ['Tecnolog', 'Tecnología', 'Tecnologia', 'Tech', 'technology']) ?? ''
      ).trim() || null,
    action_type:
      String(
        pickField(row, ['Tipos Acciones', 'Tipo Accion', 'Tipos Accion', 'Accion', 'action_type']) ??
          ''
      ).trim() || null,
    status,
    unit_price: parseMoney(
      pickField(row, ['Precio unitario', 'Precio', 'unit_price', 'P. Unit'])
    ),
    quantity: Math.max(
      0,
      Math.floor(parseMoney(pickField(row, ['Cantidad', 'Qty', 'quantity', 'Cant'])))
    ),
  };
}

export function CostsPoTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CostPoLineInput>(emptyForm());

  const { data: result, isLoading, error } = useQuery({
    queryKey: ['cost-po-lines'],
    queryFn: getCostPoLines,
  });

  const rows = result?.data ?? EMPTY;
  const loadError = result?.error || (error instanceof Error ? error.message : null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.po_number, r.sku, r.description, r.technology, r.action_type, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const kpis = useMemo(() => {
    let qty = 0;
    let sinIva = 0;
    let conIva = 0;
    const pos = new Set<string>();
    for (const r of filtered) {
      pos.add(r.po_number);
      qty += r.quantity;
      const t = calcPoLineTotals(r.unit_price, r.quantity);
      sinIva += t.totalSinIva;
      conIva += t.totalConIva;
    }
    return { lines: filtered.length, pos: pos.size, qty, sinIva, conIva };
  }, [filtered]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['cost-po-lines'] });
  };

  const openCreate = () => {
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (row: CostPoLine) => {
    setForm({
      id: row.id,
      po_number: row.po_number,
      po_date: row.po_date,
      sku: row.sku || '',
      description: row.description,
      technology: row.technology || '',
      action_type: row.action_type || '',
      status: row.status,
      unit_price: row.unit_price,
      quantity: row.quantity,
      notes: row.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setBusy(true);
    const { error: saveError } = await saveCostPoLine(form);
    setBusy(false);
    if (saveError) {
      notify.error('No se pudo guardar la línea PO', { description: saveError });
      return;
    }
    notify.success(form.id ? 'Línea PO actualizada' : 'Línea PO creada');
    setShowForm(false);
    setForm(emptyForm());
    await refresh();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Eliminar línea PO',
      message: '¿Eliminar esta línea de la orden de compra?',
      tone: 'error',
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    setBusy(true);
    const { error: delError } = await deleteCostPoLine(id);
    setBusy(false);
    if (delError) {
      notify.error('No se pudo eliminar', { description: delError });
      return;
    }
    notify.success('Línea eliminada');
    await refresh();
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const sample = [
      {
        Modelo: 'CGNV5CLR',
        Tecnolog: 'EMTA',
        'Tipos Acciones': 'REPARACIONES',
        Descripcion: 'CABLE MODEM EMTA HITRON CGNV5CLR (REP)',
        Estatus: 'Pendiente de PO/ en Proceso',
        Cantidad: 465,
        'Precio unitario': 4.32,
      },
      {
        Modelo: 'HG8245W5-6T',
        Tecnolog: 'ONT',
        'Tipos Acciones': 'REACONDICIONADO',
        Descripcion: 'ONT GPON HUAWEI HG8245W5-6T (REPARADO)',
        Estatus: 'Pendiente de PO/ en Proceso',
        Cantidad: 1600,
        'Precio unitario': 3.64,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, {
      header: [...PO_TEMPLATE_HEADERS],
    });
    XLSX.utils.book_append_sheet(wb, ws, 'PO');
    XLSX.writeFile(wb, 'Plantilla_Costos_PO.xlsx');
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      let draft = json
        .map((row) => mapExcelRowToPoLine(row))
        .filter((r): r is CostPoLineInput => Boolean(r));

      if (draft.length === 0) {
        notify.warning('Sin filas válidas', {
          description:
            'El Excel debe traer columnas Modelo / Descripcion / Cantidad / Precio unitario (plantilla Costos PO).',
        });
        return;
      }

      const missingPo = draft.some((r) => !String(r.po_number || '').trim());
      let defaultPo = '';
      let defaultDate: string | null = new Date().toISOString().slice(0, 10);

      if (missingPo) {
        const poPrompt = await promptDialog({
          title: 'Número de PO',
          message:
            'La plantilla no incluye columna PO. Ingresa el número de orden de compra para todas las filas del archivo.',
          confirmText: 'Continuar',
          prompt: { placeholder: '4500374829', required: true },
        });
        defaultPo = String(poPrompt || '').trim();
        if (!defaultPo) {
          notify.warning('Importación cancelada', {
            description: 'Se requiere un número de PO para cargar el Excel.',
          });
          return;
        }
        draft = json
          .map((row) =>
            mapExcelRowToPoLine(row, { po_number: defaultPo, po_date: defaultDate })
          )
          .filter((r): r is CostPoLineInput => Boolean(r));
      }

      const ok = await confirmDialog({
        title: 'Importar Excel PO',
        message: `Se importarán ${draft.length} línea(s) desde "${file.name}"${
          defaultPo ? ` bajo PO ${defaultPo}` : ''
        }. ¿Continuar?`,
        tone: 'warning',
        confirmText: 'Importar',
      });
      if (!ok) return;

      const resultImport = await importCostPoLines(draft);
      if (resultImport.error && resultImport.inserted === 0) {
        notify.error('Error al importar', { description: resultImport.error });
        return;
      }

      notify.success('Excel importado', {
        description: `${resultImport.inserted} línea(s) agregada(s)${
          resultImport.skipped ? ` · ${resultImport.skipped} omitida(s)` : ''
        }${resultImport.error ? ` · aviso: ${resultImport.error}` : ''}`,
      });
      await refresh();
    } catch (err: unknown) {
      notify.error('No se pudo leer el Excel', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(false);
    }
  };

  const columns: DataTableColumn<CostPoLine>[] = [
    {
      id: 'po',
      header: 'PO',
      width: '120px',
      cellClassName: 'font-mono font-black text-[var(--heading)]',
      cell: (r) => r.po_number,
    },
    {
      id: 'date',
      header: 'Date',
      width: '90px',
      cellClassName: 'font-bold text-slate-600',
      cell: (r) => formatPoDate(r.po_date),
    },
    {
      id: 'sku',
      header: 'Modelo',
      width: '130px',
      cellClassName: 'font-mono font-bold text-slate-700',
      cell: (r) => r.sku || '—',
    },
    {
      id: 'tech',
      header: 'Tecnolog',
      width: '90px',
      align: 'center',
      cell: (r) => (
        <Badge className="bg-slate-100 text-slate-700 border-none font-black text-[9px] uppercase">
          {r.technology || '—'}
        </Badge>
      ),
    },
    {
      id: 'action',
      header: 'Tipos Acciones',
      width: '130px',
      cellClassName: 'text-[10px] font-black uppercase text-slate-600',
      cell: (r) => r.action_type || '—',
    },
    {
      id: 'desc',
      header: 'Descripcion',
      width: 'minmax(220px,1.6fr)',
      cellClassName: 'font-bold text-[var(--heading)] text-[11px]',
      cell: (r) => r.description,
    },
    {
      id: 'status',
      header: 'Estatus',
      width: 'minmax(160px,1.1fr)',
      cell: (r) => {
        const delivered = String(r.status).toLowerCase().includes('entregado');
        return (
          <span className={`text-[10px] font-black ${delivered ? 'text-emerald-700' : 'text-amber-700'}`}>
            {r.status}
          </span>
        );
      },
    },
    {
      id: 'qty',
      header: 'Cantidad',
      width: '90px',
      align: 'right',
      cellClassName: 'font-black text-[var(--heading)] tabular-nums',
      cell: (r) => r.quantity.toLocaleString('es-GT'),
    },
    {
      id: 'price',
      header: 'Precio unitario',
      width: '110px',
      align: 'right',
      cellClassName: 'font-mono font-bold text-slate-700',
      cell: (r) => money(r.unit_price),
    },
    {
      id: 'sin',
      header: 'Total sin IVA',
      width: '120px',
      align: 'right',
      cellClassName: 'font-mono font-black text-[var(--heading)]',
      cell: (r) => money(calcPoLineTotals(r.unit_price, r.quantity).totalSinIva),
    },
    {
      id: 'con',
      header: 'Total con IVA',
      width: '120px',
      align: 'right',
      cellClassName: 'font-mono font-black text-rose-600',
      cell: (r) => money(calcPoLineTotals(r.unit_price, r.quantity).totalConIva),
    },
    {
      id: 'actions',
      header: 'Acciones',
      width: '100px',
      align: 'center',
      cell: (r) => (
        <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openEdit(r)}
            className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-amber-600 hover:border-amber-300"
            title="Editar"
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete(r.id)}
            className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-rose-600 hover:border-rose-300"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 border-l-4 border-l-[var(--heading)]">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">POs</p>
          <p className="text-2xl font-black text-[var(--heading)] tabular-nums">{kpis.pos}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-slate-400">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Líneas</p>
          <p className="text-2xl font-black text-[var(--heading)] tabular-nums">{kpis.lines}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cantidad</p>
          <p className="text-2xl font-black text-[var(--heading)] tabular-nums">
            {kpis.qty.toLocaleString('es-GT')}
          </p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total sin IVA</p>
          <p className="text-xl font-black text-[var(--heading)] tabular-nums">{money(kpis.sinIva)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-rose-500">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Total con IVA ({Math.round(COST_PO_IVA_RATE * 100)}%)
          </p>
          <p className="text-xl font-black text-rose-600 tabular-nums">{money(kpis.conIva)}</p>
        </Card>
      </div>

      <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-xl shadow-slate-200/50">
        <div className="p-5 border-b border-[var(--border)] bg-[var(--surface-hover)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-[var(--accent)]" />
            <div>
              <h3 className="text-sm font-black text-[var(--heading)] uppercase tracking-widest">
                Órdenes de Compra (PO)
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Modelo · Tecnolog · Tipos Acciones · precios · IVA
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar PO, modelo, descripción..."
                className="w-full h-10 pl-10 pr-3 bg-[var(--surface)] border-2 border-[var(--border)] rounded-xl text-xs font-bold outline-none focus:border-[var(--accent)]"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleExcelImport(e)}
            />
            <Button
              variant="outline"
              className="h-10 font-black uppercase text-[10px] tracking-widest gap-2"
              onClick={downloadTemplate}
              disabled={importing}
            >
              <FileSpreadsheet size={14} /> Plantilla
            </Button>
            <Button
              variant="outline"
              className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-black uppercase text-[10px] tracking-widest gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || busy}
            >
              <Upload size={14} /> {importing ? 'Importando...' : 'Subir Excel'}
            </Button>
            <Button
              className="h-10 bg-[var(--heading)] text-white font-black uppercase text-[10px] tracking-widest gap-2"
              onClick={openCreate}
              disabled={importing}
            >
              <Plus size={14} /> Nueva línea
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs font-bold">
            {loadError}
          </div>
        )}

        {isLoading ? (
          <div className="p-10 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
            Cargando PO...
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(r) => r.id}
            rowHeight={52}
            maxBodyHeight={560}
            minWidth={1280}
            headerClassName="bg-slate-700"
            headerTextClassName="text-white"
            emptyMessage="No hay líneas de PO registradas"
          />
        )}
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl p-0 overflow-hidden shadow-2xl">
            <div className="bg-[var(--heading)] text-white p-5 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest">
                {form.id ? 'Editar línea PO' : 'Nueva línea PO'}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">PO *</label>
                <input
                  value={form.po_number}
                  onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                  placeholder="4500374829"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={form.po_date || ''}
                  onChange={(e) => setForm({ ...form, po_date: e.target.value || null })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Modelo</label>
                <input
                  value={form.sku || ''}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                  placeholder="CGNV5CLR"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Tecnolog</label>
                <input
                  value={form.technology || ''}
                  onChange={(e) => setForm({ ...form, technology: e.target.value })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                  placeholder="EMTA / ONT / STB / IPTV"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Tipos Acciones
                </label>
                <input
                  value={form.action_type || ''}
                  onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                  placeholder="REACONDICIONADO / REPARACIONES"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Estatus</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                >
                  {COST_PO_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Descripcion *
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Precio unitario
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) || 0 })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold font-mono outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Cantidad</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })}
                  className="w-full h-11 px-3 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="w-full rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs font-bold text-slate-600">
                  Sin IVA: {money(calcPoLineTotals(form.unit_price, form.quantity).totalSinIva)}
                  {' · '}
                  Con IVA: {money(calcPoLineTotals(form.unit_price, form.quantity).totalConIva)}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button
                disabled={busy}
                className="bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[10px] tracking-widest"
                onClick={() => void handleSave()}
              >
                {busy ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
