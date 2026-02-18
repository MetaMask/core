import type { ClientControllerState } from './ClientController';

/**
 * Selects whether the UI is currently open.
 *
 * @param state - The ClientController state.
 * @returns True if the UI is open.
 */
const selectIsUiOpen = (state: ClientControllerState): boolean =>
  state.isUiOpen;

/**
 * Selectors for the ClientController state.
 * These can be used with Redux or directly with controller state.
 */
export const clientControllerSelectors = {
  selectIsUiOpen,
};
