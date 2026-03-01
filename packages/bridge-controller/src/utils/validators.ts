import { isValidHexAddress } from '@metamask/controller-utils';
import type { Infer } from '@metamask/superstruct';
import {
  any,
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
import {
  CaipAssetTypeStruct,
  CaipChainIdStruct,
  isStrictHexString,
} from '@metamask/utils';

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

const VersionStringSchema = define<string>(
  'VersionString',
  (v: unknown) =>
    typeof v === 'string' &&
    /^(\d+\.*){2}\d+$/u.test(v) &&
    v.split('.').length === 3,
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
  fee: optional(number()),
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

/**
 * Identifier of the intent protocol used for order creation and submission.
 *
 * Examples:
 * - CoW Swap
 * - Other EIP-712–based intent protocols
 */
const IntentProtocolSchema = string();

/**
 * Schema for an intent-based order used for EIP-712 signing and submission.
 *
 * This represents the minimal subset of fields required by intent-based
 * protocols (e.g. CoW Swap) to build, sign, and submit an order.
 */
export const IntentOrderSchema = type({
  /**
   * Address of the token being sold.
   */
  sellToken: HexAddressSchema,

  /**
   * Address of the token being bought.
   */
  buyToken: HexAddressSchema,

  /**
   * Optional receiver of the bought tokens.
   * If omitted, defaults to the signer / order owner.
   */
  receiver: optional(HexAddressSchema),

  /**
   * Order expiration time.
   *
   * Can be provided as a UNIX timestamp in seconds, either as a number
   * or as a digit string, depending on provider requirements.
   */
  validTo: DigitStringOrNumberSchema,

  /**
   * Arbitrary application-specific data attached to the order.
   */
  appData: string(),

  /**
   * Hash of the `appData` field, used for EIP-712 signing.
   */
  appDataHash: HexStringSchema,

  /**
   * Fee amount paid for order execution, expressed as a digit string.
   */
  feeAmount: TruthyDigitStringSchema,

  /**
   * Order kind.
   *
   * - `sell`: exact sell amount, variable buy amount
   * - `buy`: exact buy amount, variable sell amount
   */
  kind: enums(['sell', 'buy']),

  /**
   * Whether the order can be partially filled.
   */
  partiallyFillable: boolean(),

  /**
   * Exact amount of the sell token.
   *
   * Required for `sell` orders.
   */
  sellAmount: optional(TruthyDigitStringSchema),

  /**
   * Exact amount of the buy token.
   *
   * Required for `buy` orders.
   */
  buyAmount: optional(TruthyDigitStringSchema),

  /**
   * Optional order owner / sender address.
   *
   * Provided for convenience when building the EIP-712 domain and message.
   */
  from: optional(HexAddressSchema),
});

/**
 * Schema representing an intent submission payload.
 *
 * Wraps the intent order along with protocol and optional routing metadata
 * required by the backend or relayer infrastructure.
 */
export const IntentSchema = type({
  /**
   * Identifier of the intent protocol used to interpret the order.
   */
  protocol: IntentProtocolSchema,

  /**
   * The intent order to be signed and submitted.
   */
  order: IntentOrderSchema,

  /**
   * Optional settlement contract address used for execution.
   */
  settlementContract: optional(HexAddressSchema),

  /**
   * Optional EIP-712 typed data payload for signing.
   * Must be JSON-serializable and include required EIP-712 fields.
   */
  typedData: type({
    // Keep values as `any()` here. Using `unknown()` in this record causes
    // TS2321/TS2589 (excessive type instantiation depth) in bridge state
    // inference during build.
    domain: record(string(), any()),
    message: record(string(), any()),
  }),
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
  intent: optional(IntentSchema),
  /**
   * A third party sponsors the gas. If true, then gasIncluded7702 is also true.
   */
  gasSponsored: optional(boolean()),
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

export const TronTradeDataSchema = type({
  raw_data_hex: string(),
  visible: optional(boolean()),
  raw_data: optional(
    nullable(
      type({
        contract: optional(
          array(
            type({
              type: optional(string()),
            }),
          ),
        ),
        fee_limit: optional(number()),
      }),
    ),
  ),
});

export const QuoteResponseSchema = type({
  quote: QuoteSchema,
  estimatedProcessingTimeInSeconds: number(),
  approval: optional(union([TxDataSchema, TronTradeDataSchema])),
  trade: union([
    TxDataSchema,
    BitcoinTradeDataSchema,
    TronTradeDataSchema,
    string(),
  ]),
});

export const validateQuoteResponse = (
  data: unknown,
): data is Infer<typeof QuoteResponseSchema> => {
  assert(data, QuoteResponseSchema);
  return true;
};
