/* eslint-disable @typescript-eslint/naming-convention */
import type { Infer } from '@metamask/superstruct';
import {
  any,
  string,
  boolean,
  number,
  type,
  record,
  array,
  optional,
  enums,
  define,
  union,
  assert,
  pattern,
  intersection,
  nullable,
} from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';

import { BridgeAssetSchema, ChainIdSchema } from './bridge-asset';
import {
  TxDataSchema,
  TronTradeDataSchema,
  BitcoinTradeDataSchema,
  HexAddressOrChecksumAddressSchema,
  StellarTradeDataSchema,
} from './trade';

export enum FeeType {
  METABRIDGE = 'metabridge',
  REFUEL = 'refuel',
  TX_FEE = 'txFee',
}

export enum DiscountType {
  VIP = 'vip',
  PROMO = 'promo',
  DAO = 'dao',
}

export enum ActionTypes {
  BRIDGE = 'bridge',
  SWAP = 'swap',
  REFUEL = 'refuel',
}

export const NumberStringSchema = define<string>(
  'NumberString',
  (value: unknown) => typeof value === 'string' && /^\d+$/u.test(value),
);

export const truthyString = (value: string): boolean => Boolean(value?.length);
const TruthyDigitStringSchema = pattern(string(), /^\d+$/u);

export const FeeDataSchema = type({
  amount: TruthyDigitStringSchema,
  asset: BridgeAssetSchema,
  discountType: optional(nullable(string())),
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
  sellToken: HexAddressOrChecksumAddressSchema,

  /**
   * Address of the token being bought.
   */
  buyToken: HexAddressOrChecksumAddressSchema,

  /**
   * Optional receiver of the bought tokens.
   * If omitted, defaults to the signer / order owner.
   */
  receiver: optional(HexAddressOrChecksumAddressSchema),

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
  appDataHash: StrictHexStruct,

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
  from: optional(HexAddressOrChecksumAddressSchema),
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
  settlementContract: optional(HexAddressOrChecksumAddressSchema),

  /**
   * Optional EIP-712 typed data payload for signing.
   * Must be JSON-serializable and include required EIP-712 fields.
   */
  typedData: type({
    // Keep values as `any()` here. Using `unknown()` in this record causes
    // TS2321/TS2589 (excessive type instantiation depth) in bridge state
    // inference during build.
    types: record(
      string(),
      array(
        type({
          name: string(),
          type: string(),
        }),
      ),
    ),
    primaryType: string(),
    domain: record(string(), any()),
    message: record(string(), any()),
  }),
});

export const TxFeeGasLimitsSchema = type({
  maxFeePerGas: NumberStringSchema,
  maxPriorityFeePerGas: NumberStringSchema,
});

export const GaslessPropertiesSchema = type({
  gasIncluded: optional(boolean()),
  /**
   * Whether the quote can use EIP-7702 delegated gasless execution
   */
  gasIncluded7702: optional(boolean()),
  /**
   * A third party sponsors the gas. If true, then gasIncluded7702 is also true.
   */
  gasSponsored: optional(boolean()),
});

export const QuoteSchema = intersection([
  GaslessPropertiesSchema,
  type({
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
        intersection([FeeDataSchema, TxFeeGasLimitsSchema]),
      ),
    }),
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
  }),
]);

export const QuoteResponseSchema = type({
  quoteId: optional(string()),
  quote: QuoteSchema,
  estimatedProcessingTimeInSeconds: number(),
  approval: optional(union([TxDataSchema, TronTradeDataSchema])),
  trade: union([
    TxDataSchema,
    BitcoinTradeDataSchema,
    TronTradeDataSchema,
    StellarTradeDataSchema,
    string(),
  ]),
});

export const validateQuoteResponseV1 = (
  data: unknown,
): data is Infer<typeof QuoteResponseSchema> => {
  assert(data, QuoteResponseSchema);
  return true;
};
