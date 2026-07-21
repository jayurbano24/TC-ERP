'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { useAuthz } from '@/components/authz';
import { fetchSystemHealth } from '@/modules/system-health/client/fetchSystemHealth';
import { HeartPulse, RefreshCw, ShieldCheck } from 'lucide-react';
import { HealthScoreBanner } from './_components/HealthScoreBanner';
import { ServiceSemaphore } from './_components/ServiceSemaphore';
import { AlertsPanel } from './_components/AlertsPanel';
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
import { PerformancePanel } from './_components/PerformancePanel';
import { PlatformDeepPanel } from './_components/PlatformDeepPanel';
import { IntegrationsPanel } from './_components/IntegrationsPanel';
import { QueueDeepPanel } from './_components/QueueDeepPanel';
import { OpsExtrasPanel } from './_components/OpsExtrasPanel';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'platform', label: 'Platform' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'processing', label: 'Processing' },
  { id: 'observability', label: 'Observability' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SistemaSaludPage() {
  const { isAdmin, isLoading: authzLoading } = useAuthz();
  const [tab, setTab] = useState<TabId>('overview');

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 15_000 : false,
  });

  if (authzLoading) {
    return (
      <ModulePage title="Health Center" subtitle="Cargando…" category="Sistema">
        <p className="text-sm text-[var(--muted)]">Verificando permisos…</p>
      </ModulePage>
    );
  }

  if (!isAdmin) {
    return (
      <ModulePage title="Health Center" subtitle="Acceso restringido" category="Sistema">
        <Card className="space-y-3 p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-[var(--muted)]" />
          <h3 className="text-lg font-black text-[var(--heading)]">Solo Gerente General</h3>
          <p className="mx-auto max-w-md text-sm text-[var(--muted)]">
            Centro de operaciones del sistema. Acceso limitado a administradores.
          </p>
        </Card>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="Health Center"
      subtitle="NOC · disponibilidad, colas, usuarios e integraciones"
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
          <Card className="h-40 animate-pulse bg-[var(--surface-hover)]" />
          <Card className="h-24 animate-pulse bg-[var(--surface-hover)]" />
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
          <HealthScoreBanner
            score={data.healthScore ?? 0}
            overall={data.overall}
            riskLabel={data.riskLabel ?? 'Medio'}
            alertsCount={data.alerts?.length ?? 0}
            incidentsCritical={
              data.alerts?.filter((a) => a.severity === 'critical').length ?? 0
            }
            deploy={
              data.deploy ?? {
                version: data.api.version,
                commitSha: null,
                commitShort: null,
                branch: null,
                environment: 'production',
                checkedAt: data.checkedAt,
              }
            }
            diagnosis={
              data.diagnosis ?? {
                needsIntervention: data.overall !== 'ok',
                severity: data.overall === 'ok' ? 'none' : 'warning',
                summary: 'Estado derivado',
                affectedUsers: data.users.connected,
                failedService: null,
                recommendedAction: 'Revisar paneles',
              }
            }
            checkedAt={data.checkedAt}
          />

          <ServiceSemaphore items={data.semaphore ?? []} />

          <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                  tab === t.id
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--heading)]'
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-auto self-center text-[10px] text-[var(--muted)]">
              Sync UI {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}
            </span>
          </div>

          {tab === 'overview' ? (
            <div className="space-y-6">
              <HealthKpiStrip health={data} />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <AlertsPanel alerts={data.alerts ?? []} />
                <QueueDeepPanel
                  queue={
                    data.queueDeep ?? {
                      pending: data.queues.outboxPending,
                      processing: null,
                      failed: data.queues.outboxFailed,
                      deadLetter: null,
                      note: 'Outbox',
                    }
                  }
                />
              </div>
              <ConnectedUsersTable
                users={data.users.connectedUsers ?? []}
                idleMinutes={data.users.idleMinutes ?? 45}
                connected={data.users.connected}
              />
            </div>
          ) : null}

          {tab === 'performance' ? <PerformancePanel health={data} /> : null}

          {tab === 'platform' ? (
            <div className="space-y-6">
              <PlatformDeepPanel health={data} />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SupabaseStatusCard supabase={data.supabase} database={data.database} />
                <ServicesStatusPanel health={data} />
              </div>
              <HostResourcesCard note={data.host.note} />
            </div>
          ) : null}

          {tab === 'integrations' ? (
            <IntegrationsPanel integrations={data.integrations ?? []} />
          ) : null}

          {tab === 'processing' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <QueuesPanel queues={data.queues} />
                <QueueDeepPanel
                  queue={
                    data.queueDeep ?? {
                      pending: data.queues.outboxPending,
                      processing: null,
                      failed: data.queues.outboxFailed,
                      deadLetter: null,
                      note: 'Outbox',
                    }
                  }
                />
              </div>
              <CronStatusTable crons={data.crons} />
              <ConsumptionCard consumption={data.consumption} />
            </div>
          ) : null}

          {tab === 'observability' ? (
            <div className="space-y-6">
              <OpsExtrasPanel health={data} />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <TrafficUsersPanel traffic={data.traffic} users={data.users} />
                <AlertsPanel alerts={data.alerts ?? []} />
              </div>
              <Errors24hTable
                syncFailures={data.errors24h.syncFailures}
                outboxFailed={data.errors24h.outboxFailed}
                samples={data.errors24h.samples}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </ModulePage>
  );
}
