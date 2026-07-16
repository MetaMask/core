import { createSelector } from 'reselect';

import type {
  NetworkConnectionBannerControllerState,
  FailedNetwork,
  NetworkConnectionBannerStatus,
} from './NetworkConnectionBannerController.js';

/**
 * Selects the banner status from the controller state.
 *
 * @param state - The controller state
 * @returns The banner status
 */
const selectNetworkConnectionBannerStatus = (
  state: NetworkConnectionBannerControllerState,
): NetworkConnectionBannerStatus => state.networkConnectionBannerStatus;

/**
 * Selects the failing network the banner describes, or `null` when no banner
 * is shown.
 *
 * @param state - The controller state
 * @returns The failing network details, or `null`
 */
const selectNetworkConnectionBannerNetwork = (
  state: NetworkConnectionBannerControllerState,
): FailedNetwork | null => state.networkConnectionBannerNetwork;

/**
 * Selects whether the banner is visible (status is `degraded` or
 * `unavailable`).
 *
 * @param state - The controller state
 * @returns Whether the banner is visible
 */
const selectIsNetworkConnectionBannerVisible = createSelector(
  [selectNetworkConnectionBannerStatus],
  (status) => status === 'degraded' || status === 'unavailable',
);

/**
 * Selectors for the NetworkConnectionBannerController state.
 * These can be used with Redux or directly with controller state.
 */
export const networkConnectionBannerControllerSelectors = {
  selectNetworkConnectionBannerStatus,
  selectNetworkConnectionBannerNetwork,
  selectIsNetworkConnectionBannerVisible,
};
