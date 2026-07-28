'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge, DataTable, type DataTableColumn, notify } from '@/components/ui';
import { CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react';
import { erpFieldClass } from '@/lib/design/tokens';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  fetchDespachoEquipoListoPage,
  type DespachoEquipoListoRow,
} from '@/lib/api/despachoEquipoListo';

type ListoRow = {
  key: string;
  os: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  tech: string;
  brand: string;
  model: string;
  box: string;
  material: string;
  valuation: string;
  updatedAt: string;
};

function adaptRow(raw: DespachoEquipoListoRow): ListoRow {
  const sns = raw.all_sns?.length
    ? raw.all_sns
    : [raw.serial_number].filter((s): s is string => Boolean(s));
  return {
    key: String(raw.service_order_id || raw.id),
    os: raw.service_orders?.os_label || 'S/OS',
    s1: sns[0] || '—',
    s2: sns[1] || '—',
    s3: sns[2] || '—',
    s4: sns[3] || '—',
    tech: raw.models?.technologies?.name || '—',
    brand: raw.brands?.name || '—',
    model: raw.models?.name || '—',
    box: raw.source_box_code || raw.boxes?.box_code || '—',
    material: String(raw.material ?? '').trim() || '—',
    valuation: String(raw.valuation ?? '').trim() || '—',
    // Nota: material/valuation vienen del SSOT series (sync SAP / G985).
    updatedAt: raw.updated_at
      ? new Date(raw.updated_at).toLocaleString('es-GT')
      : '—',
  };
}

/**
 * Cola de equipos aceptados en QC (Equipo Listo) listos para Outbound.
 */
export function EquipoListoPanel() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);

  const query = useQuery({
    queryKey: ['despacho-equipo-listo', debouncedSearch],
    queryFn: () => fetchDespachoEquipoListoPage({ search: debouncedSearch }),
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => (query.data?.items ?? []).map(adaptRow),
    [query.data?.items]
  );

  const columns: DataTableColumn<ListoRow>[] = useMemo(
    () => [
      {
        id: 'os',
        header: 'OS',
        width: '110px',
        cell: (r) => (
          <span className="text-xs font-black font-mono text-[var(--heading)]">{r.os}</span>
        ),
      },
      {
        id: 's1',
        header: 'S1',
        width: 'minmax(120px,1.2fr)',
        cell: (r) => <span className="text-[11px] font-mono font-bold text-slate-800">{r.s1}</span>,
      },
      {
        id: 's2',
        header: 'S2',
        width: 'minmax(100px,1fr)',
        cell: (r) => <span className="text-[11px] font-mono text-slate-600">{r.s2}</span>,
      },
      {
        id: 's3',
        header: 'S3',
        width: 'minmax(100px,1fr)',
        cell: (r) => <span className="text-[11px] font-mono text-slate-600">{r.s3}</span>,
      },
      {
        id: 's4',
        header: 'S4',
        width: 'minmax(100px,1fr)',
        cell: (r) => <span className="text-[11px] font-mono text-slate-600">{r.s4}</span>,
      },
      {
        id: 'tech',
        header: 'Tec.',
        width: '80px',
        cell: (r) => <span className="text-[10px] font-bold uppercase text-slate-600">{r.tech}</span>,
      },
      {
        id: 'model',
        header: 'Modelo',
        width: 'minmax(120px,1.2fr)',
        cell: (r) => (
          <span className="text-[11px] font-semibold text-slate-800">
            {r.brand} {r.model}
          </span>
        ),
      },
      {
        id: 'material',
        header: 'Material',
        width: '100px',
        cell: (r) => <span className="text-[10px] font-mono text-slate-700">{r.material}</span>,
      },
      {
        id: 'valuation',
        header: 'Valoración',
        width: '110px',
        cell: (r) => <span className="text-[10px] font-bold text-slate-600">{r.valuation}</span>,
      },
      {
        id: 'fecha',
        header: 'Listo desde',
        width: '140px',
        cell: (r) => <span className="text-[10px] text-slate-500">{r.updatedAt}</span>,
      },
    ],
    []
  );

  return (
    <div className="space-y-4 animate-in fade-in">
      <Card className="p-4 border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-[var(--heading)]">
                Equipo Listo
              </h3>
              <p className="text-xs text-[var(--muted)]">
                Aceptados en Control de Calidad — listos para escanear en Outbound.
              </p>
            </div>
            <Badge variant="blue" className="ml-2 font-black text-[10px]">
              {query.data?.totalOs ?? rows.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar OS o serie…"
                className={`${erpFieldClass} pl-8 h-9 text-xs`}
              />
            </div>
            <Button
              variant="outline"
              className="h-9 px-3"
              onClick={() => {
                void query.refetch().then((r) => {
                  if (r.isError) {
                    notify.error('No se pudo refrescar Equipo Listo', {
                      description: r.error instanceof Error ? r.error.message : undefined,
                    });
                  }
                });
              }}
              leftIcon={
                query.isFetching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )
              }
            >
              Actualizar
            </Button>
          </div>
        </div>
      </Card>

      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando equipos listos…
        </div>
      ) : query.isError ? (
        <Card className="p-8 text-center border-rose-200 bg-rose-50/40">
          <p className="text-sm font-bold text-rose-700">No se pudo cargar Equipo Listo</p>
          <p className="text-xs text-rose-600 mt-1">
            {query.error instanceof Error ? query.error.message : 'Error desconocido'}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.key}
          compact
          emptyMessage="No hay equipos en Equipo Listo. Aparecen aquí tras QC → Aceptado → Listo."
        />
      )}
    </div>
  );
}
