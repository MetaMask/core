import type { BridgeStatusControllerState } from './types';

export const REFRESH_INTERVAL_MS = 10 * 1000; // 10 seconds
export const MAX_ATTEMPTS = (10 * 60 * 1000) / REFRESH_INTERVAL_MS; // 60 attempts = 10 minutes

export const BRIDGE_STATUS_CONTROLLER_NAME = 'BridgeStatusController';

export const DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE: BridgeStatusControllerState =
  {
    txHistory: {},
  };

export const BRIDGE_PROD_API_BASE_URL = 'https://bridge.api.cx.metamask.io';

export const LINEA_DELAY_MS = 5000;

export enum TraceName {
  BridgeTransactionApprovalCompleted = 'Bridge Transaction Approval Completed',
  BridgeTransactionCompleted = 'Bridge Transaction Completed',
  SwapTransactionApprovalCompleted = 'Swap Transaction Approval Completed',
  SwapTransactionCompleted = 'Swap Transaction Completed',
}
