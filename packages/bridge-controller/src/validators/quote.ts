import {
  type,
  optional,
  boolean,
  intersection,
  string,
  number,
  array,
  nullable,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import { AmountsAndAssetSchema } from './amount-and-asset';
import { ChainIdSchema, BridgeAssetSchema } from './bridge-asset';
import { IntentSchema } from './intent';
import {
  TruthyDigitStringSchema,
  NumberStringSchema,
  FloatStringSchema,
} from './number';
import { RefuelDataSchema, StepSchema, StepSchemaV2 } from './step';

export enum FeeType {
  METABRIDGE = 'metabridge',
  REFUEL = 'refuel',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  TX_FEE = 'txFee',
  NETWORK = 'network',
  RELAYER = 'relayer',
}

export enum DiscountType {
  VIP = 'vip',
  PROMO = 'promo',
  DAO = 'dao',
}

export const FeeDataSchema = type({
  amount: TruthyDigitStringSchema,
  asset: BridgeAssetSchema,
  discountType: optional(nullable(string())),
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
      [FeeType.METABRIDGE]: intersection([
        FeeDataSchema,
        type({
          quoteBpsFee: optional(number()),
          baseBpsFee: optional(number()),
        }),
      ]),
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
    // TODO require this after v2 migration
    protocols: optional(array(string())),
    // TODO require this after v2 migration
    aggregator: optional(string()),
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
    walletAddress: optional(string()),
    destWalletAddress: optional(string()),
    slippage: optional(number()),
  }),
]);

export type Quote = Infer<typeof QuoteSchema>;

export const QuoteSchemaV2 = intersection([
  GaslessPropertiesSchema,
  type({
    requestId: string(),
    src: intersection([
      AmountsAndAssetSchema,
      type({
        // amount: NumberStringSchema,
        walletAddress: optional(string()),
      }),
    ]),
    dest: intersection([
      AmountsAndAssetSchema,
      type({
        // amount: NumberStringSchema,
        minAmount: optional(string()),
        minAmountUsd: optional(string()),
        minAmountValueInCurrency: optional(string()),
        minAmountNormalized: optional(string()),
        walletAddress: optional(string()),
      }),
    ]),
    priceData: optional(
      type({
        swapRate: optional(FloatStringSchema),
        priceImpact: optional(
          type({
            usd: optional(nullable(FloatStringSchema)),
            amount: optional(nullable(FloatStringSchema)),
            valueInCurrency: optional(FloatStringSchema),
          }),
        ),
        adjustedReturn: optional(
          type({
            usd: nullable(optional(FloatStringSchema)),
            valueInCurrency: nullable(optional(FloatStringSchema)),
          }),
        ),
      }),
    ),
    feeData: type({
      [FeeType.METABRIDGE]: array(
        intersection([
          AmountsAndAssetSchema,
          type({
            quoteBpsFee: optional(number()),
            baseBpsFee: optional(number()),
            discountType: optional(nullable(string())),
          }),
        ]),
      ),
      [FeeType.REFUEL]: optional(array(AmountsAndAssetSchema)),
      /**
       * The tx fees included in the quote for gasless execution
       */
      [FeeType.TX_FEE]: optional(
        array(intersection([AmountsAndAssetSchema, TxFeeGasLimitsSchema])),
      ),
      /**
       * The gas fees for the quote, excluding any provider or relayer fees
       */
      [FeeType.NETWORK]: optional(array(AmountsAndAssetSchema)),
      /**
       * The relayer or provider fees for the quote,
       */
      [FeeType.RELAYER]: optional(array(AmountsAndAssetSchema)),
    }),
    aggregator: string(),
    protocols: array(string()),
    steps: optional(array(StepSchemaV2)),
    refuel: optional(StepSchema),
    intent: optional(IntentSchema),
    slippage: optional(number()),
  }),
]);
