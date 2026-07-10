import {
  array,
  boolean,
  enums,
  number,
  object,
  string,
  nullable,
} from '@metamask/superstruct';

const DataFreshnessStruct = enums(['live', 'degraded']);

const VaultPositionStruct = object({
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
  effective_apy: string(),
});

export const PositionResponseStruct = object({
  address: string(),
  as_of_block: number(),
  as_of_timestamp: string(),
  data_freshness: DataFreshnessStruct,
  indexer_lag_seconds: number(),
  positions: array(VaultPositionStruct),
});

export const InterestResponseStruct = object({
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

const CashFlowEntryStruct = object({
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

export const HistoryResponseStruct = object({
  address: string(),
  cash_flows: array(CashFlowEntryStruct),
  next_cursor: nullable(string()),
  has_more: boolean(),
  as_of_block: number(),
  as_of_timestamp: string(),
  data_freshness: DataFreshnessStruct,
  indexer_lag_seconds: number(),
});

const RateHistoryEntryStruct = object({
  timestamp: string(),
  block_number: number(),
  rate: string(),
  tx_hash: string(),
});

export const RateHistoryResponseStruct = object({
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
