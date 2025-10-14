import { isValidHexAddress } from '@metamask/controller-utils';
import type { Infer } from '@metamask/superstruct';
import {
  string,
  boolean,
  number,
  type,
  is,
  record,
  array,
  nullable,
  optional,
  enums,
  define,
  union,
  assert,
  pattern,
  intersection,
} from '@metamask/superstruct';
import { CaipAssetTypeStruct, isStrictHexString } from '@metamask/utils';

export enum FeeType {
  METABRIDGE = 'metabridge',
  REFUEL = 'refuel',
  TX_FEE = 'txFee',
}

export enum FeatureId {
  PERPS = 'perps',
}

export enum ActionTypes {
  BRIDGE = 'bridge',
  SWAP = 'swap',
  REFUEL = 'refuel',
}

const HexAddressSchema = define<string>('HexAddress', (v: unknown) =>
  isValidHexAddress(v as string, { allowNonPrefixed: false }),
);

const HexStringSchema = define<string>('HexString', (v: unknown) =>
  isStrictHexString(v as string),
);

export const truthyString = (s: string) => Boolean(s?.length);
const TruthyDigitStringSchema = pattern(string(), /^\d+$/u);

const ChainIdSchema = number();

export const BridgeAssetSchema = type({
  /**
   * The chainId of the token
   */
  chainId: ChainIdSchema,
  /**
   * An address that the metaswap-api recognizes as the default token
   */
  address: string(),
  /**
   * The assetId of the token
   */
  assetId: CaipAssetTypeStruct,
  /**
   * The symbol of token object
   */
  symbol: string(),
  /**
   * The name for the network
   */
  name: string(),
  decimals: number(),
  /**
   * URL for token icon
   */
  icon: optional(nullable(string())),
  /**
   * URL for token icon
   */
  iconUrl: optional(nullable(string())),
});

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

export const ChainConfigurationSchema = type({
  isActiveSrc: boolean(),
  isActiveDest: boolean(),
  refreshRate: optional(number()),
  topAssets: optional(array(string())),
  stablecoins: optional(array(string())),
  isUnifiedUIEnabled: optional(boolean()),
  isSingleSwapBridgeButtonEnabled: optional(boolean()),
  isGaslessSwapEnabled: optional(boolean()),
  noFeeAssets: optional(array(string())),
  defaultPairs: optional(DefaultPairSchema),
});

export const PriceImpactThresholdSchema = type({
  gasless: number(),
  normal: number(),
});

const GenericQuoteRequestSchema = type({
  aggIds: optional(array(string())),
  bridgeIds: optional(array(string())),
  noFee: optional(boolean()),
});

const FeatureIdSchema = enums(Object.values(FeatureId));

/**
 * This is the schema for the feature flags response from the RemoteFeatureFlagController
 */
export const PlatformConfigSchema = type({
  priceImpactThreshold: optional(PriceImpactThresholdSchema),
  quoteRequestOverrides: optional(
    record(FeatureIdSchema, optional(GenericQuoteRequestSchema)),
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
  sseEnabled: optional(boolean()),
});

export const validateFeatureFlagsResponse = (
  data: unknown,
): data is Infer<typeof PlatformConfigSchema> => {
  return is(data, PlatformConfigSchema);
};

export const validateSwapsTokenObject = (
  data: unknown,
): data is Infer<typeof BridgeAssetSchema> => {
  return is(data, BridgeAssetSchema);
};

export const FeeDataSchema = type({
  amount: TruthyDigitStringSchema,
  asset: BridgeAssetSchema,
});

export const ProtocolSchema = type({
  name: string(),
  displayName: optional(string()),
  icon: optional(string()),
});

export const StepSchema = type({
  action: enums(Object.values(ActionTypes)),
  srcChainId: ChainIdSchema,
  destChainId: optional(ChainIdSchema),
  srcAsset: BridgeAssetSchema,
  destAsset: BridgeAssetSchema,
  srcAmount: string(),
  destAmount: string(),
  protocol: ProtocolSchema,
});

const RefuelDataSchema = StepSchema;

export const QuoteSchema = type({
  requestId: string(),
  srcChainId: ChainIdSchema,
  srcAsset: BridgeAssetSchema,
  /**
   * The amount sent, in atomic amount: amount sent - fees
   * Some tokens have a fee of 0, so sometimes it's equal to amount sent
   */
  srcTokenAmount: string(),
  destChainId: ChainIdSchema,
  destAsset: BridgeAssetSchema,
  /**
   * The amount received, in atomic amount
   */
  destTokenAmount: string(),
  /**
   * The minimum amount that will be received, in atomic amount
   */
  minDestTokenAmount: string(),
  feeData: type({
    [FeeType.METABRIDGE]: FeeDataSchema,
    /**
     * This is the fee for the swap transaction taken from either the
     * src or dest token if the quote has gas fees included or "gasless"
     */
    [FeeType.TX_FEE]: optional(
      intersection([
        FeeDataSchema,
        type({
          maxFeePerGas: string(),
          maxPriorityFeePerGas: string(),
        }),
      ]),
    ),
  }),
  gasIncluded: optional(boolean()),
  /**
   * Whether the quote can use EIP-7702 delegated gasless execution
   */
  gasIncluded7702: optional(boolean()),
  bridgeId: string(),
  bridges: array(string()),
  steps: array(StepSchema),
  refuel: optional(RefuelDataSchema),
  priceData: optional(
    type({
      totalFromAmountUsd: optional(string()),
      totalToAmountUsd: optional(string()),
      priceImpact: optional(string()),
      totalFeeAmountUsd: optional(string()),
    }),
  ),
});

export const TxDataSchema = type({
  chainId: number(),
  to: HexAddressSchema,
  from: HexAddressSchema,
  value: HexStringSchema,
  data: HexStringSchema,
  gasLimit: nullable(number()),
  effectiveGas: optional(number()),
});

export const BitcoinTradeDataSchema = type({
  unsignedPsbtBase64: string(),
  inputsToSign: nullable(array(type({}))),
});

export const QuoteResponseSchema = type({
  quote: QuoteSchema,
  estimatedProcessingTimeInSeconds: number(),
  approval: optional(TxDataSchema),
  trade: union([TxDataSchema, BitcoinTradeDataSchema, string()]),
});

export const BitcoinQuoteResponseSchema = type({
  quote: QuoteSchema,
  estimatedProcessingTimeInSeconds: number(),
  approval: optional(TxDataSchema),
  trade: BitcoinTradeDataSchema,
});

export const validateQuoteResponse = (
  data: unknown,
): data is Infer<typeof QuoteResponseSchema> => {
  assert(data, QuoteResponseSchema);
  return true;
};

export const validateBitcoinQuoteResponse = (
  data: unknown,
): data is Infer<typeof BitcoinQuoteResponseSchema> => {
  assert(data, BitcoinQuoteResponseSchema);
  return true;
};
