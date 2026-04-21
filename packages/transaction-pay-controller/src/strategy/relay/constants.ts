import { TransactionType } from '@metamask/transaction-controller';

import type { RelayStatus } from './types';

export const RELAY_URL_BASE = 'https://api.relay.link';
export const RELAY_AUTHORIZE_URL = `${RELAY_URL_BASE}/authorize`;
export const RELAY_EXECUTE_URL = `${RELAY_URL_BASE}/execute`;
export const RELAY_QUOTE_URL = `${RELAY_URL_BASE}/quote`;
export const RELAY_STATUS_URL = `${RELAY_URL_BASE}/intents/status/v3`;
export const HYPERLIQUID_EXCHANGE_URL = 'https://api.hyperliquid.xyz/exchange';
export const RELAY_POLLING_INTERVAL = 1000; // 1 Second
export const TOKEN_TRANSFER_FOUR_BYTE = '0xa9059cbb';

export const RELAY_FAILURE_STATUSES: RelayStatus[] = [
  'failure',
  'refund',
  'refunded',
];

export const RELAY_PENDING_STATUSES: RelayStatus[] = [
  'delayed',
  'depositing',
  'pending',
  'submitted',
  'waiting',
];

export const RELAY_DEPOSIT_TYPES: Record<string, TransactionType> = {
  [TransactionType.musdConversion]: TransactionType.musdRelayDeposit,
  [TransactionType.predictDeposit]: TransactionType.predictRelayDeposit,
  [TransactionType.perpsDeposit]: TransactionType.perpsRelayDeposit,
};
