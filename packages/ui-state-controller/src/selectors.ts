import type { UiStateControllerState } from './UiStateController';

/**
 * Selects whether the UI is currently open.
 *
 * @param state - The UiStateController state.
 * @returns True if the UI is open.
 */
const selectIsUiOpen = (state: UiStateControllerState): boolean =>
  state.isUiOpen;

/**
 * Selectors for the UiStateController state.
 * These can be used with Redux or directly with controller state.
 */
export const uiStateControllerSelectors = {
  selectIsUiOpen,
};
