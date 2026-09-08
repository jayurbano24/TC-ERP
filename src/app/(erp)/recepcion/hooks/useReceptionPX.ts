import { usePxUiState, type PxUiState } from './usePxUiState';

/** Facade — expone solo presentation state. Datos operativos vienen de useReceptionPXIncremental. */
export function useReceptionPX(): PxUiState {
  return usePxUiState();
}

export type { PxUiState };
