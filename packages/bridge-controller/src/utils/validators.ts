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

export const ChainConfigurationSchema = type({
  isActiveSrc: boolean(),
  isActiveDest: boolean(),
  refreshRate: optional(number()),
  topAssets: optional(array(string())),
  isUnifiedUIEnabled: optional(boolean()),
  isSingleSwapBridgeButtonEnabled: optional(boolean()),
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

// Allow digit strings for amounts/validTo for flexibility across providers
const DigitStringOrNumberSchema = union([TruthyDigitStringSchema, number()]);


// Intent support (e.g., CoW Swap EIP-712 order signing)
const IntentProtocolSchema = enums(['cowswap']);

export const CowSwapOrderSchema = type({
  // EIP-712 Order fields (subset required for signing/submission)
  sellToken: HexAddressSchema,
  buyToken: HexAddressSchema,
  receiver: optional(HexAddressSchema),
  validTo: DigitStringOrNumberSchema,
  appData: string(),
  appDataHash: HexStringSchema,
  feeAmount: TruthyDigitStringSchema,
  kind: enums(['sell', 'buy']),
  partiallyFillable: boolean(),
  // One of these is required by CoW depending on kind; we keep both optional here and rely on backend validation
  sellAmount: optional(TruthyDigitStringSchema),
  buyAmount: optional(TruthyDigitStringSchema),
  // Optional owner/from for convenience when building domain/message
  from: optional(HexAddressSchema),
});

export const IntentSchema = type({
  protocol: IntentProtocolSchema,
  order: CowSwapOrderSchema,
  // Optional metadata to aid submission/routing
  settlementContract: optional(HexAddressSchema),
  relayer: optional(HexAddressSchema),
  quoteId: optional(nullable(string())),
});


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
  gasless7702: optional(boolean()),
  bridgeId: string(),
  bridges: array(string()),
  steps: array(StepSchema),
  refuel: optional(RefuelDataSchema),
  priceData: optional(
    type({
      totalFromAmountUsd: optional(string()),
      totalToAmountUsd: optional(string()),
      priceImpact: optional(string()),
    }),
  ),
  intent: optional(IntentSchema),
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

export const QuoteResponseSchema = type({
  quote: QuoteSchema,
  estimatedProcessingTimeInSeconds: number(),
  approval: optional(TxDataSchema),
  trade: union([TxDataSchema, string()]),
});

export const validateQuoteResponse = (
  data: unknown,
): data is Infer<typeof QuoteResponseSchema> => {
  assert(data, QuoteResponseSchema);
  return true;
};
