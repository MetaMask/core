import type { AnalyticsControllerState } from './AnalyticsController';
import { computeEnabledState } from './analyticsStateComputer';

/**
 * Selects the analytics ID from the controller state.
 *
 * @param state - The controller state
 * @returns The analytics ID
 */
const selectAnalyticsId = (state: AnalyticsControllerState): string =>
  state.analyticsId;

/**
 * Selects the opted-in status from the controller state.
 *
 * @param state - The controller state
 * @returns Whether the user has opted in for regular account
 */
const selectOptedIn = (state: AnalyticsControllerState): boolean =>
  state.optedInForRegularAccount;

/**
 * Selects the social opted-in status from the controller state.
 *
 * @param state - The controller state
 * @returns Whether the user has opted in for social account
 */
const selectSocialOptedIn = (state: AnalyticsControllerState): boolean =>
  state.optedInForSocialAccount;

/**
 * Selects the enabled status from the controller state.
 * This is computed from user state via the state computer.
 *
 * @param state - The controller state
 * @returns Whether analytics tracking is enabled
 */
const selectEnabled = (state: AnalyticsControllerState): boolean =>
  computeEnabledState(state);

/**
 * Selectors for the AnalyticsController state.
 * These can be used with Redux or directly with controller state.
 */
export const analyticsControllerSelectors = {
  selectAnalyticsId,
  selectOptedIn,
  selectSocialOptedIn,
  selectEnabled,
};

