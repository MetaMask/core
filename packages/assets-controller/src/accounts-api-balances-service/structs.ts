import {
  array,
  boolean,
  enums,
  nullable,
  number,
  optional,
  string,
  type,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

/**
 * Stellar specific token metadata (trustline and native reserve fields).
 * All fields are optional and unknown fields are allowed.
 */
const TokenBalanceMetadataStruct = type({
  limit: optional(string()),
  authorized: optional(boolean()),
  sponsored: optional(boolean()),
  spendableBalance: optional(string()),
  minimumReserveBalance: optional(string()),
});

/**
 * DeFi protocol metadata attached to `object: defi` rows (v6 only).
 */
const DefiBalanceMetadataStruct = type({
  protocolId: string(),
  productName: string(),
  description: string(),
  protocolUrl: string(),
  protocolIconUrl: optional(string()),
  positionType: enums([
    'deposit',
    'loan',
    'locked',
    'staked',
    'reward',
    'wallet',
    'investment',
  ]),
  poolAddress: string(),
  groupId: string(),
});

/**
 * A string field the data source does not read. It is kept loose (optional
 * and nullable) so an API change to it never rejects a whole response.
 */
const LooseStringStruct = optional(nullable(string()));

/**
 * A number field the data source does not read, kept loose for the same
 * reason as {@link LooseStringStruct}.
 */
const LooseNumberStruct = optional(nullable(number()));

/**
 * A v5 balance row. Only `accountId`, `assetId`, `balance` and `metadata` are
 * read by the data source, every other field is loose.
 */
const V5BalanceItemStruct = type({
  object: LooseStringStruct,
  symbol: LooseStringStruct,
  name: LooseStringStruct,
  type: LooseStringStruct,
  decimals: LooseNumberStruct,
  assetId: string(),
  balance: string(),
  accountId: string(),
  metadata: optional(nullable(TokenBalanceMetadataStruct)),
});

/**
 * A v6 balance row. Only `accountId`, `assetId`, `balance`, `object` and
 * `metadata` are read by the data source, every other field is loose.
 * `object` is a plain string so unknown row kinds are skipped by the data
 * source instead of rejecting the response.
 */
const V6BalanceItemStruct = type({
  accountId: string(),
  object: string(),
  type: LooseStringStruct,
  assetId: string(),
  name: LooseStringStruct,
  symbol: LooseStringStruct,
  decimals: LooseNumberStruct,
  balance: string(),
  price: LooseStringStruct,
  labels: optional(nullable(array(string()))),
  canonicalHead: LooseStringStruct,
  metadata: optional(
    nullable(union([DefiBalanceMetadataStruct, TokenBalanceMetadataStruct])),
  ),
});

/** Accounts API v5 multi account balances response. */
export const V5BalancesResponseStruct = type({
  count: number(),
  unprocessedNetworks: array(string()),
  balances: array(V5BalanceItemStruct),
});

/** Accounts API v6 multi account balances response. */
export const V6BalancesResponseStruct = type({
  unprocessedNetworks: array(string()),
  unprocessedIncludeAssetIds: array(string()),
  balances: array(V6BalanceItemStruct),
  processingDefiPositions: optional(nullable(array(string()))),
});

/** A validated v5 or v6 balances response. */
export type BalancesResponse =
  | Infer<typeof V5BalancesResponseStruct>
  | Infer<typeof V6BalancesResponseStruct>;
