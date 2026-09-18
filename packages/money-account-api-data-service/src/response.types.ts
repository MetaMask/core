import type { Infer } from '@metamask/superstruct';

import type {
  HistoryResponseStruct,
  InterestResponseStruct,
  PositionResponseStruct,
  RateHistoryResponseStruct,
} from './structs.js';

// All types in this file mirror the external Money Account API's snake_case
// JSON contract verbatim to maintain 1:1 parity with API responses.
/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Data freshness indicator returned by all business endpoints.
 */
export type DataFreshness = 'live' | 'degraded';

/**
 * A single vault position within the positions response.
 */
export type VaultPosition = {
  vault_address: string;
  shares_held: string;
  current_rate: string;
  current_value_assets: string;
  current_value_usd: string;
  cost_basis_assets: string;
  cost_basis_usd: string;
  realized_interest_usd: string;
  unrealised_interest_usd: string;
  lifetime_interest_usd: string;
  current_apy: string;
  effective_apy: string;
};

/**
 * Balance summary on the positions response.
 * `null` when the API's wallet-balance path is disabled or unavailable.
 */
export type PositionBalance = {
  musd_balance: string;
  vmusd_value_in_musd: string;
  total_balance: string;
};

/**
 * Response from `GET /v1/positions/:address`.
 * Derived from {@link PositionResponseStruct} to ensure type/struct parity.
 */
export type PositionResponse = Infer<typeof PositionResponseStruct>;

/**
 * Response from `GET /v1/positions/:address/interest`.
 * Derived from {@link InterestResponseStruct} to ensure type/struct parity.
 */
export type InterestResponse = Infer<typeof InterestResponseStruct>;

/**
 * Cash-flow type for the history endpoint.
 */
export type CashFlowType =
  | 'deposit'
  | 'withdraw'
  | 'transfer_in'
  | 'transfer_out';

/**
 * Cash-flow source label.
 */
export type CashFlowSource =
  | 'teller'
  | 'withdraw_queue'
  | 'atomic_queue'
  | 'erc20_transfer'
  | 'cross_chain';

/**
 * A single entry in the cash-flow history.
 */
export type CashFlowEntry = {
  type: CashFlowType;
  chain_id: number;
  vault_address: string;
  timestamp: string;
  block_number: number;
  log_index: number;
  tx_hash: string;
  assets_usd: string;
  assets_wei: string;
  shares_wei: string;
  rate: string;
  source: CashFlowSource;
};

/**
 * Response from `GET /v1/positions/:address/history`.
 * Derived from {@link HistoryResponseStruct} to ensure type/struct parity.
 */
export type HistoryResponse = Infer<typeof HistoryResponseStruct>;

/**
 * A single entry in the rate-history time series.
 */
export type RateHistoryEntry = {
  timestamp: string;
  block_number: number;
  rate: string;
  tx_hash: string;
};

/**
 * Response from `GET /v1/vaults/:address/rate-history`.
 * Derived from {@link RateHistoryResponseStruct} to ensure type/struct parity.
 */
export type RateHistoryResponse = Infer<typeof RateHistoryResponseStruct>;
