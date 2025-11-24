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
 * Selects the opted-in status for regular account from the controller state.
 *
 * @param state - The controller state
 * @returns Whether the user has opted in for regular account
 */
const selectOptedInForRegularAccount = (
  state: AnalyticsControllerState,
): boolean => state.optedInForRegularAccount;

/**
 * Selects the opted-in status for social account from the controller state.
 *
 * @param state - The controller state
 * @returns Whether the user has opted in for social account
 */
const selectOptedInForSocialAccount = (
  state: AnalyticsControllerState,
): boolean => state.optedInForSocialAccount;

/**
 * Selects the enabled status from the controller state.
 * Analytics is enabled if the user has opted in for regular account OR social account.
 *
 * @param state - The controller state
 * @returns Whether analytics tracking is enabled
 */
const selectEnabled = (state: AnalyticsControllerState): boolean =>
  state.optedInForRegularAccount || state.optedInForSocialAccount;

/**
 * Selectors for the AnalyticsController state.
 * These can be used with Redux or directly with controller state.
 */
export const analyticsControllerSelectors = {
  selectAnalyticsId,
  selectOptedInForRegularAccount,
  selectOptedInForSocialAccount,
  selectEnabled,
};
