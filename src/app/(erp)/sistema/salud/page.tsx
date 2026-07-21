'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { useAuthz } from '@/components/authz';
import { fetchSystemHealth } from '@/modules/system-health/client/fetchSystemHealth';
import { Activity, HeartPulse, RefreshCw, ShieldCheck } from 'lucide-react';
import { HealthOverallBanner } from './_components/HealthOverallBanner';
import { HealthKpiStrip } from './_components/HealthKpiStrip';
import { HostResourcesCard } from './_components/HostResourcesCard';
import { QueuesPanel } from './_components/QueuesPanel';
import { Errors24hTable } from './_components/Errors24hTable';
import { CronStatusTable } from './_components/CronStatusTable';
import { ConsumptionCard } from './_components/ConsumptionCard';
import { SupabaseStatusCard } from './_components/SupabaseStatusCard';
import { ServicesStatusPanel } from './_components/ServicesStatusPanel';
import { TrafficUsersPanel } from './_components/TrafficUsersPanel';
import { ConnectedUsersTable } from './_components/ConnectedUsersTable';

export default function SistemaSaludPage() {
  const { isAdmin, isLoading: authzLoading } = useAuthz();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30_000 : false,
  });

  if (authzLoading) {
    return (
      <ModulePage title="Salud del Sistema" subtitle="Cargando…" category="Sistema">
        <p className="text-sm text-[var(--muted)]">Verificando permisos…</p>
      </ModulePage>
    );
  }

  if (!isAdmin) {
    return (
      <ModulePage
        title="Salud del Sistema"
        subtitle="Acceso restringido"
        category="Sistema"
      >
        <Card className="space-y-3 p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-[var(--muted)]" />
          <h3 className="text-lg font-black text-[var(--heading)]">Solo Gerente General</h3>
          <p className="mx-auto max-w-md text-sm text-[var(--muted)]">
            Este módulo expone estado de API, Supabase, colas y crons. Está limitado a
            administradores.
          </p>
        </Card>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="Salud del Sistema"
      subtitle="API, Redis, BullMQ, Supabase, tráfico, usuarios, colas y recursos"
      category="Sistema"
      actions={
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      }
    >
      {isLoading && !data ? (
        <div className="space-y-4">
          <Card className="h-28 animate-pulse bg-[var(--surface-hover)]" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="h-28 animate-pulse bg-[var(--surface-hover)]" />
            ))}
          </div>
        </div>
      ) : error ? (
        <Card className="space-y-3 p-8 text-center">
          <HeartPulse className="mx-auto h-10 w-10 text-[var(--danger)]" />
          <h3 className="text-lg font-black text-[var(--heading)]">No se pudo cargar el estado</h3>
          <p className="text-sm text-[var(--muted)]">
            {error instanceof Error ? error.message : 'Error desconocido'}
          </p>
          <Button variant="primary" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </Card>
      ) : data ? (
        <div className="space-y-6">
          <HealthOverallBanner overall={data.overall} checkedAt={data.checkedAt} />
          <HealthKpiStrip health={data} />

          <ConnectedUsersTable
            users={data.users.connectedUsers ?? []}
            idleMinutes={data.users.idleMinutes ?? 45}
            connected={data.users.connected}
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ServicesStatusPanel health={data} />
            <TrafficUsersPanel traffic={data.traffic} users={data.users} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SupabaseStatusCard supabase={data.supabase} database={data.database} />
            <QueuesPanel queues={data.queues} />
            <ConsumptionCard consumption={data.consumption} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <HostResourcesCard note={data.host.note} />
            <Card className="flex items-center gap-4 p-6">
              <div className="rounded-xl bg-[var(--accent)]/15 p-3 text-[var(--accent)]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  Servicio
                </p>
                <p className="text-sm font-black text-[var(--heading)]">{data.api.service}</p>
                <p className="text-xs text-[var(--muted)]">
                  Versión {data.api.version} · probe {data.api.latencyMs} ms · agregador{' '}
                  {data.api.aggregateMs} ms
                </p>
              </div>
            </Card>
          </div>

          <CronStatusTable crons={data.crons} />
          <Errors24hTable
            syncFailures={data.errors24h.syncFailures}
            outboxFailed={data.errors24h.outboxFailed}
            samples={data.errors24h.samples}
          />
        </div>
      ) : null}
    </ModulePage>
  );
}
