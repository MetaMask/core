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
  chain_id: number;
  /** Stable vault identity within the environment, such as `standard` or `premium`. */
  vault_key: string;
  name: string;
  asset_symbol: string;
  /** Decimal exponent of the underlying asset. */
  asset_decimals: number;
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
  /**
   * Realised money-weighted annual return.
   * `null` means the position has been invested for fewer than 28 days.
   */
  effective_apy: string | null;
};

/**
 * One underlying asset in the positions balance breakdown.
 */
export type AssetBalance = {
  asset_contract_address: string;
  asset_symbol: string;
  asset_decimals: number;
  /** Liquid wallet balance of this asset, in smallest units. */
  wallet_balance: string;
  /** Vault positions denominated in this asset, in smallest units. */
  vault_value: string;
  /** `wallet_balance` + `vault_value`, in smallest units of this asset. */
  total: string;
  /** USD value of `total`. */
  total_usd: string;
};

/**
 * Balance summary on the positions response.
 * `null` when the API's wallet-balance path is disabled or unavailable.
 *
 * `musd_balance`, `vmusd_value_in_musd`, and `total_balance` are mUSD-only.
 * Prefer `by_asset` and `total_balance_usd` for a multi-asset portfolio.
 */
export type PositionBalance = {
  musd_balance: string;
  vmusd_value_in_musd: string;
  total_balance: string;
  /** ISO-8601 timestamp of the last wallet mUSD observation, when provided. */
  musd_balance_updated_at?: string | null;
  by_asset: AssetBalance[];
  /** Total across every asset, normalised to USD. */
  total_balance_usd: string;
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
