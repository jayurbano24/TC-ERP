'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, Button, Badge, notify, SegmentedTabs } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { erpSoftStat } from '@/lib/design/tokens';
import { useAuthz } from '@/components/authz';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Inbox,
  History,
  Package,
} from 'lucide-react';
import {
  listBoxDeletionRequests,
  reviewBoxDeletion,
} from '@/modules/inventario/client/warehouseBoxes';
import {
  fetchPartDeletionRequests,
  reviewPartDeletionApi,
} from '@/lib/api/parts';

type Tab = 'pending' | 'approved' | 'rejected' | 'all';

type AuthRow = {
  id: string;
  kind: 'box' | 'part';
  status: string;
  title: string;
  reason: string;
  observations?: string | null;
  requested_at?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  meta?: string;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Rechazadas' },
  { id: 'all', label: 'Historial' },
];

function statusBadge(status: string) {
  if (status === 'pending') return <Badge variant="yellow">Pendiente</Badge>;
  if (status === 'approved') return <Badge variant="green">Aprobada</Badge>;
  if (status === 'rejected') return <Badge variant="default">Rechazada</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

async function loadAuthRows(statusParam: string): Promise<AuthRow[]> {
  const [boxes, parts] = await Promise.all([
    listBoxDeletionRequests(statusParam, 100),
    fetchPartDeletionRequests(statusParam).catch(() => [] as any[]),
  ]);
  if (boxes.error) throw new Error(boxes.error);

  const boxRows: AuthRow[] = (boxes.data || []).map((r: any) => ({
    id: r.id,
    kind: 'box' as const,
    status: r.status,
    title: r.box_code || r.box_id,
    reason: r.reason,
    observations: r.observations,
    requested_at: r.requested_at,
    reviewed_at: r.reviewed_at,
    review_notes: r.review_notes,
    meta: `${r.equipos_count ?? 0} equipos · rack ${r.rack || '—'}`,
  }));

  const partRows: AuthRow[] = (parts || []).map((r: any) => ({
    id: r.id,
    kind: 'part' as const,
    status: r.status,
    title: `${r.sku || '—'} · ${r.part_name || 'Pieza'}`,
    reason: r.reason,
    observations: r.observations,
    requested_at: r.requested_at,
    reviewed_at: r.reviewed_at,
    review_notes: r.review_notes,
    meta: `Stock al solicitar: ${r.qty_on_hand ?? 0}`,
  }));

  return [...boxRows, ...partRows].sort((a, b) => {
    const ta = a.requested_at ? new Date(a.requested_at).getTime() : 0;
    const tb = b.requested_at ? new Date(b.requested_at).getTime() : 0;
    return tb - ta;
  });
}

export default function AutorizacionesPage() {
  const { isAdmin, isLoading: authzLoading } = useAuthz();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusParam = tab === 'all' ? 'all' : tab;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['authorization-requests', statusParam],
    queryFn: () => loadAuthRows(statusParam),
    enabled: isAdmin,
    refetchInterval: isAdmin && tab === 'pending' ? 20_000 : false,
  });

  const { data: pendingCountData } = useQuery({
    queryKey: ['authorization-requests', 'pending', 'count'],
    queryFn: async () => (await loadAuthRows('pending')).length,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 20_000 : false,
  });

  const rows = data || [];
  const pendingCount = pendingCountData ?? 0;

  const stats = useMemo(
    () => [
      {
        label: 'Pendientes',
        value: pendingCount,
        icon: <Clock className="w-5 h-5" />,
        tone: erpSoftStat.warning,
      },
      {
        label: 'En esta vista',
        value: rows.length,
        icon: <Inbox className="w-5 h-5" />,
        tone: erpSoftStat.accent,
      },
      {
        label: 'Tipos',
        value: 'Cajas + Piezas',
        icon: <Package className="w-5 h-5" />,
        tone: erpSoftStat.muted,
        isText: true,
      },
    ],
    [pendingCount, rows.length]
  );

  const review = async (row: AuthRow, decision: 'approve' | 'reject') => {
    setBusyId(row.id);
    try {
      if (row.kind === 'box') {
        const res = await reviewBoxDeletion({ requestId: row.id, decision });
        if (res.error) {
          notify.error('No se pudo resolver la solicitud', { description: res.error });
          return;
        }
        notify.success(
          decision === 'approve' ? 'Eliminación de caja autorizada' : 'Solicitud rechazada'
        );
      } else {
        await reviewPartDeletionApi(row.id, decision);
        notify.success(
          decision === 'approve'
            ? 'Eliminación de pieza autorizada'
            : 'Solicitud de pieza rechazada'
        );
      }
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['authorization-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['box-deletion-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['parts-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['parts-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-boxes'] }),
      ]);
    } catch (e: unknown) {
      notify.error('No se pudo resolver', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  };

  if (authzLoading) {
    return (
      <ModulePage title="Autorizaciones" subtitle="Cargando…" category="Gestión">
        <p className="text-sm text-[var(--muted)]">Verificando permisos…</p>
      </ModulePage>
    );
  }

  if (!isAdmin) {
    return (
      <ModulePage title="Autorizaciones" subtitle="Acceso restringido" category="Gestión">
        <Card className="p-8 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-[var(--muted)] mx-auto" />
          <h3 className="text-lg font-black text-[var(--heading)]">Solo Gerente General</h3>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            Este módulo concentra las solicitudes que requieren autorización previa (cajas y
            piezas con stock).
          </p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Volver al Dashboard
          </Button>
        </Card>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="Autorizaciones"
      subtitle="Bandeja del Gerente General: apruebe o rechace acciones pre-autorizadas."
      category="Gestión"
      actions={
        <Button
          variant="outline"
          size="sm"
          leftIcon={<History className="w-4 h-4" />}
          onClick={() => void refetch()}
        >
          Actualizar
        </Button>
      }
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5 flex items-center gap-4" padding="md">
              <div className={`p-3 rounded-2xl ${s.tone}`}>{s.icon}</div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  {s.label}
                </p>
                <p
                  className={`font-black text-[var(--heading)] ${s.isText ? 'text-sm mt-1' : 'text-2xl'}`}
                >
                  {s.value}
                </p>
              </div>
            </Card>
          ))}
        </div>

        <SegmentedTabs
          items={TABS.map((t) => ({
            id: t.id,
            label:
              t.id === 'pending' && pendingCount > 0 ? `${t.label} (${pendingCount})` : t.label,
          }))}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          className="flex-wrap"
        />

        <Card className="p-0 overflow-hidden" padding="none">
          <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
            <div>
              <h3 className="font-bold text-[var(--heading)]">Solicitudes de eliminación</h3>
              <p className="text-[11px] text-[var(--muted)]">
                Cajas de bodega y piezas con stock. Soft delete / desactivación solo tras
                aprobación.
              </p>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {isLoading ? (
              <p className="text-sm text-[var(--muted)] py-8 text-center">Cargando solicitudes…</p>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Inbox className="w-8 h-8 text-[var(--muted)]/40 mx-auto" />
                <p className="text-sm font-bold text-[var(--foreground)]">
                  No hay solicitudes en esta vista
                </p>
                <p className="text-[12px] text-[var(--muted)]">
                  Cuando Bodega solicite eliminar una caja o una pieza con stock, aparecerá aquí.
                </p>
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={`${r.kind}-${r.id}`}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] p-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={r.kind === 'part' ? 'blue' : 'slate'}>
                        {r.kind === 'part' ? 'Pieza' : 'Caja'}
                      </Badge>
                      <span className="font-mono font-black text-[var(--heading)] text-lg">
                        {r.title}
                      </span>
                      {statusBadge(r.status)}
                      <span className="text-[10px] text-[var(--muted)]">
                        Solicitada:{' '}
                        {r.requested_at ? new Date(r.requested_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--foreground)]">
                      <span className="font-bold">Motivo:</span> {r.reason}
                    </p>
                    {r.observations ? (
                      <p className="text-[12px] text-[var(--muted)]">
                        Observaciones: {r.observations}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-[var(--muted)]">
                      {r.meta}
                      {r.reviewed_at
                        ? ` · Revisada ${new Date(r.reviewed_at).toLocaleString()}`
                        : ''}
                    </p>
                    {r.review_notes ? (
                      <p className="text-[12px] text-[var(--muted)]">
                        Nota revisión: {r.review_notes}
                      </p>
                    ) : null}
                  </div>

                  {r.status === 'pending' ? (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        disabled={busyId === r.id}
                        leftIcon={<XCircle className="w-4 h-4" />}
                        onClick={() => void review(r, 'reject')}
                      >
                        Rechazar
                      </Button>
                      <Button
                        variant="primary"
                        className="bg-emerald-600 hover:bg-emerald-700 border-none"
                        disabled={busyId === r.id}
                        leftIcon={<CheckCircle2 className="w-4 h-4" />}
                        onClick={() => void review(r, 'approve')}
                      >
                        Autorizar
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </ModulePage>
  );
}
