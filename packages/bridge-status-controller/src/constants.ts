import type { BridgeStatusControllerState } from './types';
import { BRIDGE_PROD_API_BASE_URL } from '../../bridge-controller/src';

export const REFRESH_INTERVAL_MS = 10 * 1000;

export const BRIDGE_STATUS_CONTROLLER_NAME = 'BridgeStatusController';

export const BRIDGE_STATUS_BASE_URL = BRIDGE_PROD_API_BASE_URL;

export const DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE: BridgeStatusControllerState =
  {
    txHistory: {},
  };
