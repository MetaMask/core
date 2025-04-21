import type { BridgeStatusControllerState } from './types';

export const REFRESH_INTERVAL_MS = 10 * 1000;

// The time interval for polling the bridge status API
// defaults to 5 minutes
export const POLLING_DURATION = 5 * 60 * 1000;

export const BRIDGE_STATUS_CONTROLLER_NAME = 'BridgeStatusController';

export const DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE: BridgeStatusControllerState =
  {
    txHistory: {},
  };
