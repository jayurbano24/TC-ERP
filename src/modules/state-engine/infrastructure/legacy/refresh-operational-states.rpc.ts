import { refreshOperationalStatesFromLegacy as refreshFromFactory } from '../../factory';

/** Facade legacy para jobs/cron — delega en factory del módulo. */
export const refreshOperationalStatesFromLegacy = refreshFromFactory;
