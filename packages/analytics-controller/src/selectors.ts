import type { AnalyticsControllerState } from './AnalyticsController';

/**
 * Selects the analytics ID from the controller state.
 *
 * @param state - The controller state
 * @returns The analytics ID
 */
const selectAnalyticsId = (state: AnalyticsControllerState): string =>
  state.analyticsId;

/**
 * Selects the opted-in user status from the controller state.
 * Use this selector to read the user's opt-in preference (e.g., for UI display).
 *
 * @param state - The controller state
 * @returns Whether the user has opted in to analytics
 */
const selectOptedIn = (state: AnalyticsControllerState): boolean =>
  state.optedIn;

/**
 * Selects whether analytics tracking is enabled.
 * Use this selector to determine if tracking should occur (e.g., in controller methods).
 *
 * @param state - The controller state
 * @returns Whether analytics tracking is enabled
 */
const selectEnabled = (state: AnalyticsControllerState): boolean =>
  state.optedIn;

/**
 * Selectors for the AnalyticsController state.
 * These can be used with Redux or directly with controller state.
 */
export const analyticsControllerSelectors = {
  selectAnalyticsId,
  selectOptedIn,
  selectEnabled,
};
