/* eslint-disable @typescript-eslint/naming-convention */
import {
  type,
  record,
  string,
  optional,
  array,
  boolean,
  number,
  is,
  define,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { CaipChainIdStruct, CaipAssetTypeStruct } from '@metamask/utils';

export enum FeatureId {
  UNKNOWN = 'unknown',
  PERPS = 'perps',
  QUICK_BUY_FOLLOW_TRADING = 'quick_buy_follow_trading',
  QUICK_BUY_TOKEN_DETAILS = 'quick_buy_token_details',
  QUICK_BUY_EXPLORE = 'quick_buy_explore',
  DAPP_SWAP = 'dapp_swap',
  BATCH_SELL = 'batch_sell',
  UNIFIED_SWAP_BRIDGE = 'unified_swap_bridge',
}

export const VersionStringSchema = define<string>(
  'VersionString',
  (value: unknown) =>
    typeof value === 'string' &&
    /^(\d+\.*){2}\d+$/u.test(value) &&
    value.split('.').length === 3,
);

const DefaultPairSchema = type({
  /**
   * The standard default pairs. Use this if the pair is only set once.
   * The key is the CAIP asset type of the src token and the value is the CAIP asset type of the dest token.
   */
  standard: record(string(), string()),
  /**
   * The other default pairs. Use this if the dest token depends on the src token and can be set multiple times.
   * The key is the CAIP asset type of the src token and the value is the CAIP asset type of the dest token.
   */
  other: record(string(), string()),
});

export const ChainRankingItemSchema = type({
  /**
   * The CAIP-2 chain identifier (e.g., "eip155:1" for Ethereum mainnet)
   */
  chainId: CaipChainIdStruct,
  /**
   * The display name of the chain (e.g., "Ethereum")
   */
  name: string(),
});

export const ChainRankingSchema = optional(array(ChainRankingItemSchema));

export const ChainConfigurationSchema = type({
  isActiveSrc: boolean(),
  isActiveDest: boolean(),
  refreshRate: optional(number()),
  topAssets: optional(array(string())),
  stablecoins: optional(array(string())),
  batchSellDestStablecoins: optional(array(CaipAssetTypeStruct)),
  isUnifiedUIEnabled: optional(boolean()),
  isSingleSwapBridgeButtonEnabled: optional(boolean()),
  isGaslessSwapEnabled: optional(boolean()),
  noFeeAssets: optional(array(string())),
  defaultPairs: optional(DefaultPairSchema),
});

export const PriceImpactThresholdSchema = type({
  // We are moving into a unified approach where
  // price impact thresholds will be segmented by
  // importance rather than transaction type.
  // The introduction of warning/danger will first be handled
  // by mobile, followed by extension and then removal of gasless/normal
  // from LD configs.
  // To make the migration easier, we define all fields as optional for now.
  // After the migration takes place, gasless/normal will be removed
  // and warning/danger will be set as required fields.
  gasless: number(), // Percentage value in decimal format (eg 0.02 is 2%)
  normal: number(), // Percentage value in decimal format
  warning: optional(number()), // Percentage value in decimal format
  error: optional(number()), // Percentage value in decimal format
});

const GenericQuoteRequestSchema = type({
  aggIds: optional(array(string())),
  bridgeIds: optional(array(string())),
  fee: optional(number()),
});

/**
 * This is the schema for the feature flags response from the RemoteFeatureFlagController
 */
export const PlatformConfigSchema = type({
  priceImpactThreshold: optional(PriceImpactThresholdSchema),
  quoteRequestOverrides: optional(
    record(string(), optional(GenericQuoteRequestSchema)),
  ),
  minimumVersion: string(),
  refreshRate: number(),
  maxRefreshCount: number(),
  support: boolean(),
  chains: record(string(), ChainConfigurationSchema),
  /**
   * The bip44 default pairs for the chains
   * Key is the CAIP chainId namespace
   */
  bip44DefaultPairs: optional(record(string(), optional(DefaultPairSchema))),
  sse: optional(
    type({
      enabled: boolean(),
      /**
       * The minimum version of the client required to enable SSE, for example 13.8.0
       */
      minimumVersion: VersionStringSchema,
    }),
  ),
  /**
   * Array of chain objects ordered by preference/ranking
   */
  chainRanking: ChainRankingSchema,
  maxPendingHistoryItemAgeMs: optional(number()),
});

export const validateFeatureFlagsResponse = (
  data: unknown,
): data is Infer<typeof PlatformConfigSchema> => {
  return is(data, PlatformConfigSchema);
};
