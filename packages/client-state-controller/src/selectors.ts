import type { ClientStateControllerState } from './ClientStateController';

/**
 * Selects whether the client is currently open.
 *
 * @param state - The ClientStateController state.
 * @returns True if the client is open.
 */
const selectIsClientOpen = (state: ClientStateControllerState): boolean =>
  state.isClientOpen;

/**
 * Selectors for the ClientStateController state.
 * These can be used with Redux or directly with controller state.
 */
export const clientStateControllerSelectors = {
  selectIsClientOpen,
};
