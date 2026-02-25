import { TransactionType } from '@metamask/transaction-controller';

export const RELAY_URL_BASE = 'https://api.relay.link';
export const RELAY_STATUS_URL = `${RELAY_URL_BASE}/intents/status/v3`;
export const RELAY_POLLING_INTERVAL = 1000; // 1 Second
export const TOKEN_TRANSFER_FOUR_BYTE = '0xa9059cbb';

export const RELAY_DEPOSIT_TYPES: Record<string, TransactionType> = {
  [TransactionType.predictDeposit]: TransactionType.predictRelayDeposit,
  [TransactionType.perpsDeposit]: TransactionType.perpsRelayDeposit,
};
