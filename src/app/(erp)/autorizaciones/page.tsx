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
import { listBoxDeletionRequests, reviewBoxDeletion } from '@/modules/inventario/client/warehouseBoxes';

type Tab = 'pending' | 'approved' | 'rejected' | 'all';

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

export default function AutorizacionesPage() {
  const { isAdmin, isLoading: authzLoading } = useAuthz();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusParam = tab === 'all' ? 'all' : tab;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['box-deletion-requests', statusParam],
    queryFn: async () => {
      const res = await listBoxDeletionRequests(statusParam, 100);
      if (res.error) throw new Error(res.error);
      return res.data || [];
    },
    enabled: isAdmin,
    refetchInterval: isAdmin && tab === 'pending' ? 20_000 : false,
  });

  const { data: pendingCountData } = useQuery({
    queryKey: ['box-deletion-requests', 'pending', 'count'],
    queryFn: async () => {
      const res = await listBoxDeletionRequests('pending', 100);
      return (res.data || []).length;
    },
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
        label: 'Tipo',
        value: 'Eliminación de cajas',
        icon: <Package className="w-5 h-5" />,
        tone: erpSoftStat.muted,
        isText: true,
      },
    ],
    [pendingCount, rows.length]
  );

  const review = async (requestId: string, decision: 'approve' | 'reject') => {
    setBusyId(requestId);
    try {
      const res = await reviewBoxDeletion({ requestId, decision });
      if (res.error) {
        notify.error('No se pudo resolver la solicitud', { description: res.error });
        return;
      }
      notify.success(decision === 'approve' ? 'Eliminación autorizada' : 'Solicitud rechazada', {
        description:
          decision === 'approve'
            ? 'La caja quedó en soft delete (ELIMINADO).'
            : 'La caja continúa activa.',
      });
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['box-deletion-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-boxes'] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-stats'] }),
      ]);
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
      <ModulePage
        title="Autorizaciones"
        subtitle="Acceso restringido"
        category="Gestión"
      >
        <Card className="p-8 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-[var(--muted)] mx-auto" />
          <h3 className="text-lg font-black text-[var(--heading)]">Solo Gerente General</h3>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            Este módulo concentra las solicitudes que requieren autorización previa
            (por ejemplo, eliminación de cajas de bodega).
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
                <p className={`font-black text-[var(--heading)] ${s.isText ? 'text-sm mt-1' : 'text-2xl'}`}>
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
              t.id === 'pending' && pendingCount > 0
                ? `${t.label} (${pendingCount})`
                : t.label,
          }))}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          className="flex-wrap"
        />

        <Card className="p-0 overflow-hidden" padding="none">
          <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
            <div>
              <h3 className="font-bold text-[var(--heading)]">Eliminación de cajas — Bodega</h3>
              <p className="text-[11px] text-[var(--muted)]">
                Soft delete solo tras aprobación. Las series se conservan para auditoría.
              </p>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {isLoading ? (
              <p className="text-sm text-[var(--muted)] py-8 text-center">Cargando solicitudes…</p>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Inbox className="w-8 h-8 text-[var(--muted)]/40 mx-auto" />
                <p className="text-sm font-bold text-[var(--foreground)]">No hay solicitudes en esta vista</p>
                <p className="text-[12px] text-[var(--muted)]">
                  Cuando Bodega solicite eliminar una caja, aparecerá aquí.
                </p>
              </div>
            ) : (
              rows.map((r: any) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] p-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-[var(--heading)] text-lg">
                        {r.box_code || r.box_id}
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
                      <p className="text-[12px] text-[var(--muted)]">Observaciones: {r.observations}</p>
                    ) : null}
                    <p className="text-[11px] text-[var(--muted)]">
                      {r.equipos_count ?? 0} equipos · rack {r.rack || '—'}
                      {r.reviewed_at
                        ? ` · Revisada ${new Date(r.reviewed_at).toLocaleString()}`
                        : ''}
                    </p>
                    {r.review_notes ? (
                      <p className="text-[12px] text-[var(--muted)]">Nota revisión: {r.review_notes}</p>
                    ) : null}
                  </div>

                  {r.status === 'pending' ? (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        disabled={busyId === r.id}
                        leftIcon={<XCircle className="w-4 h-4" />}
                        onClick={() => void review(r.id, 'reject')}
                      >
                        Rechazar
                      </Button>
                      <Button
                        variant="primary"
                        className="bg-emerald-600 hover:bg-emerald-700 border-none"
                        disabled={busyId === r.id}
                        leftIcon={<CheckCircle2 className="w-4 h-4" />}
                        onClick={() => void review(r.id, 'approve')}
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
