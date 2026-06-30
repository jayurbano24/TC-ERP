import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { TransitionOperationalStateHandler } from './application/commands/transition-operational-state.handler';
import { TransitionOperationalStateCommand } from './application/commands/transition-operational-state.command';
import { GetOperationalSnapshotHandler } from './application/queries/get-operational-snapshot.handler';
import { GetOperationalSnapshotQuery } from './application/queries/get-operational-snapshot.query';
import { GetOsOperationalStateHandler } from './application/queries/get-os-operational-state.handler';
import { GetOsOperationalStateQuery } from './application/queries/get-os-operational-state.query';
import { DefaultTransitionPolicy } from './domain/rules/default-transition-policy';
import type { OperationalStateCode } from './domain/enums/operational-state-code.enum';
import type { TransitionContext } from './domain/ports/transition-policy.port';
import { OperationalStateRepositoryAdapter } from './infrastructure/supabase/operational-state.repository.adapter';
import { DeriveStateFromLegacyAdapter } from './infrastructure/supabase/derive-state-from-legacy.adapter';
import { DomainEventsTimelineEmitter } from './infrastructure/timeline/domain-events-timeline.emitter';

function requireSupabaseClient() {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error('Supabase client no disponible (state-engine).');
  }
  return client;
}

function createRepository() {
  return new OperationalStateRepositoryAdapter(requireSupabaseClient());
}

function createTransitionHandler() {
  return new TransitionOperationalStateHandler(
    createRepository(),
    new DefaultTransitionPolicy(),
    new DomainEventsTimelineEmitter()
  );
}

export async function transitionOperationalState(
  serviceOrderId: string,
  targetState: OperationalStateCode,
  context?: TransitionContext
) {
  return createTransitionHandler().execute(
    new TransitionOperationalStateCommand(serviceOrderId, targetState, context ?? {})
  );
}

export async function getOperationalSnapshot() {
  return new GetOperationalSnapshotHandler(createRepository()).execute(
    new GetOperationalSnapshotQuery()
  );
}

export async function getOsOperationalState(serviceOrderId: string) {
  return new GetOsOperationalStateHandler(createRepository()).execute(
    new GetOsOperationalStateQuery(serviceOrderId)
  );
}

export async function refreshOperationalStatesFromLegacy() {
  return new DeriveStateFromLegacyAdapter(requireSupabaseClient()).refreshAllFromLegacy();
}
