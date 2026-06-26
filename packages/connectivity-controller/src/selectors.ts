import { createSelector } from 'reselect';

import type { ConnectivityControllerState } from './ConnectivityController';
import { CONNECTIVITY_STATUSES } from './types';
import type { ConnectivityStatus } from './types';

/**
 * Selects the connectivity status from the controller state.
 *
 * @param state - The controller state
 * @returns The connectivity status
 */
const selectConnectivityStatus = (
  state: ConnectivityControllerState,
): ConnectivityStatus => state.connectivityStatus;

/**
 * Selects whether the device is offline.
 *
 * @param state - The controller state
 * @returns Whether the device is offline
 */
const selectIsOffline = createSelector(
  [selectConnectivityStatus],
  (connectivityStatus) => connectivityStatus === CONNECTIVITY_STATUSES.Offline,
);

/**
 * Selectors for the ConnectivityController state.
 * These can be used with Redux or directly with controller state.
 */
export const connectivityControllerSelectors = {
  selectConnectivityStatus,
  selectIsOffline,
};
