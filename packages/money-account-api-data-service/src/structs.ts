import {
  array,
  boolean,
  enums,
  nullable,
  number,
  optional,
  string,
  type,
} from '@metamask/superstruct';

// Every schema here uses `type()` rather than `object()` so that fields the
// Money Account API adds later pass validation instead of throwing. Additive
// backend changes should not be breaking changes for clients.

const DataFreshnessStruct = enums(['live', 'degraded']);

const VaultPositionStruct = type({
  chain_id: number(),
  vault_key: string(),
  name: string(),
  asset_symbol: string(),
  asset_decimals: number(),
  vault_address: string(),
  shares_held: string(),
  current_rate: string(),
  current_value_assets: string(),
  current_value_usd: string(),
  cost_basis_assets: string(),
  cost_basis_usd: string(),
  realized_interest_usd: string(),
  unrealised_interest_usd: string(),
  lifetime_interest_usd: string(),
  current_apy: string(),
  // `null` means the position has been invested for fewer than 28 days.
  effective_apy: nullable(string()),
});

/**
 * One underlying asset in the positions balance breakdown.
 */
const AssetBalanceStruct = type({
  asset_contract_address: string(),
  asset_symbol: string(),
  asset_decimals: number(),
  wallet_balance: string(),
  vault_value: string(),
  total: string(),
  total_usd: string(),
});

/**
 * Wallet + vault balance summary on the positions response.
 * `null` when the API's wallet-balance path is disabled or unavailable.
 *
 * `musd_balance`, `vmusd_value_in_musd`, and `total_balance` are mUSD-only
 * and deprecated on the API in favor of `by_asset` and `total_balance_usd`.
 */
const PositionBalanceStruct = type({
  musd_balance: string(),
  vmusd_value_in_musd: string(),
  total_balance: string(),
  // Additive — older API builds omit this field.
  musd_balance_updated_at: optional(nullable(string())),
  by_asset: array(AssetBalanceStruct),
  total_balance_usd: string(),
});

export const PositionResponseStruct = type({
  address: string(),
  as_of_block: number(),
  as_of_timestamp: string(),
  data_freshness: DataFreshnessStruct,
  indexer_lag_seconds: number(),
  // Optional for backwards compatibility with responses that omit the field;
  // when present, may be `null` if the API balance flag is off.
  balance: optional(nullable(PositionBalanceStruct)),
  positions: array(VaultPositionStruct),
});

export const InterestResponseStruct = type({
  address: string(),
  vault_address: string(),
  window: string(),
  window_start: string(),
  window_end: string(),
  interest_earned_assets: string(),
  interest_earned_usd: string(),
  method: string(),
  as_of_block: number(),
  as_of_timestamp: string(),
  data_freshness: DataFreshnessStruct,
  indexer_lag_seconds: number(),
});

const CashFlowEntryStruct = type({
  type: enums(['deposit', 'withdraw', 'transfer_in', 'transfer_out']),
  chain_id: number(),
  vault_address: string(),
  timestamp: string(),
  block_number: number(),
  log_index: number(),
  tx_hash: string(),
  assets_usd: string(),
  assets_wei: string(),
  shares_wei: string(),
  rate: string(),
  source: enums([
    'teller',
    'withdraw_queue',
    'atomic_queue',
    'erc20_transfer',
    'cross_chain',
  ]),
});

export const HistoryResponseStruct = type({
  address: string(),
  cash_flows: array(CashFlowEntryStruct),
  next_cursor: nullable(string()),
  has_more: boolean(),
  as_of_block: number(),
  as_of_timestamp: string(),
  data_freshness: DataFreshnessStruct,
  indexer_lag_seconds: number(),
});

const RateHistoryEntryStruct = type({
  timestamp: string(),
  block_number: number(),
  rate: string(),
  tx_hash: string(),
});

export const RateHistoryResponseStruct = type({
  vault_address: string(),
  chain_id: number(),
  range_start: string(),
  range_end: string(),
  rates: array(RateHistoryEntryStruct),
  as_of_block: number(),
  as_of_timestamp: string(),
  data_freshness: DataFreshnessStruct,
  indexer_lag_seconds: number(),
});

export const VaultRateResponseStruct = type({
  vault_address: string(),
  chain_id: number(),
  rate: string(),
  timestamp: string(),
  as_of_block: number(),
  as_of_timestamp: string(),
  data_freshness: DataFreshnessStruct,
  indexer_lag_seconds: number(),
});
