import {
  assert,
  Infer,
  number,
  optional,
  string,
  type,
  union,
  intersection,
  array,
  Describe,
  nullable,
  omit,
  enums,
  literal,
  partial,
} from '@metamask/superstruct';
import {
  CaipChainId,
  CaipChainIdStruct,
  KnownCaipNamespace,
  parseCaipAssetType,
  Hex,
  StrictHexStruct,
} from '@metamask/utils';

import { formatChainIdToHex } from '../utils/caip-formatters';
import { BridgeAssetV2Schema, ChainIdSchema } from './bridge-asset';
import { FeatureId } from './feature-flags';
import {
  ActionTypes,
  FeeDataSchema,
  FeeType,
  FloatStringSchema,
  GaslessPropertiesSchema,
  IntentSchema,
  NumberStringSchema,
  StepSchema,
  TxFeeGasLimitsSchema,
} from './quote-response';
import {
  BitcoinTradeData,
  BitcoinTradeDataSchema,
  TronTradeData,
  TronTradeDataSchema,
  TxData,
  TxDataSchema,
} from './trade';

const AmountsAndAssetSchema = type({
  amount: NumberStringSchema,
  normalizedAmount: optional(FloatStringSchema),
  asset: BridgeAssetV2Schema,
  usd: optional(nullable(FloatStringSchema)),
  valueInCurrency: optional(nullable(FloatStringSchema)),
});

const GaslessFeeDataSchema = intersection([
  TxFeeGasLimitsSchema,
  AmountsAndAssetSchema,
]);

export type GaslessFeeData = Infer<typeof GaslessFeeDataSchema>;

export const StepSchemaV2 = type({
  action: enums(Object.values(ActionTypes)),
  srcChainId: ChainIdSchema,
  destChainId: ChainIdSchema,
});

export const QuoteSchemaV2 = intersection([
  GaslessPropertiesSchema,
  type({
    requestId: string(),
    src: intersection([
      AmountsAndAssetSchema,
      type({
        walletAddress: optional(string()),
      }),
    ]),
    dest: intersection([
      AmountsAndAssetSchema,
      type({
        min: optional(partial(AmountsAndAssetSchema)),
        walletAddress: optional(string()),
      }),
    ]),
    priceData: optional(
      type({
        swapRate: optional(FloatStringSchema),
        priceImpact: optional(
          type({
            usd: optional(FloatStringSchema),
            amount: optional(nullable(FloatStringSchema)),
            valueInCurrency: optional(nullable(FloatStringSchema)),
          }),
        ),
        cost: optional(
          type({
            usd: optional(nullable(FloatStringSchema)),
            valueInCurrency: optional(nullable(FloatStringSchema)),
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
        intersection([omit(FeeDataSchema, ['asset']), AmountsAndAssetSchema]),
      ),
      [FeeType.REFUEL]: optional(array(AmountsAndAssetSchema)),
      [FeeType.TX_FEE]: optional(array(GaslessFeeDataSchema)),
      [FeeType.NETWORK]: optional(array(AmountsAndAssetSchema)),
    }),
    aggregator: string(),
    protocols: array(string()),
    steps: optional(array(StepSchemaV2)),
    refuel: optional(StepSchema),
    intent: optional(IntentSchema),
    slippage: optional(number()),
  }),
]);

const CommonQuoteResponseSchema = type({
  quoteId: optional(string()),
  quote: QuoteSchemaV2,
  estimatedProcessingTimeInSeconds: number(),
});

const EvmQuoteResponseSchema = intersection([
  CommonQuoteResponseSchema,
  type({
    namespace: literal(KnownCaipNamespace.Eip155),
    chainId: CaipChainIdStruct,
    hexChainId: optional(StrictHexStruct),
    trade: TxDataSchema,
    approval: optional(TxDataSchema),
    resetApproval: optional(TxDataSchema),
  }),
]);

const TronQuoteResponseSchema = intersection([
  CommonQuoteResponseSchema,
  type({
    namespace: literal(KnownCaipNamespace.Tron),
    chainId: CaipChainIdStruct,
    trade: TronTradeDataSchema,
    approval: optional(TronTradeDataSchema),
  }),
]);

const SolanaQuoteResponseSchema = intersection([
  CommonQuoteResponseSchema,
  type({
    namespace: literal(KnownCaipNamespace.Solana),
    chainId: CaipChainIdStruct,
    trade: string(),
  }),
]);

const BitcoinQuoteResponseSchema = intersection([
  CommonQuoteResponseSchema,
  type({
    namespace: literal(KnownCaipNamespace.Bip122),
    chainId: CaipChainIdStruct,
    trade: BitcoinTradeDataSchema,
  }),
]);

export const QuoteResponseSchemaV2 = nullable(
  union([
    EvmQuoteResponseSchema,
    SolanaQuoteResponseSchema,
    TronQuoteResponseSchema,
    BitcoinQuoteResponseSchema,
  ]),
);

/**
 * This is the V2 QuoteResponse type, including metadata calculated after quote fetch
 */
export type QuoteResponse = Omit<
  NonNullable<Infer<typeof QuoteResponseSchemaV2>>,
  'trade' | 'approval' | 'resetApproval'
> & {
  /**
   * Appended to the quote if there are multiple quote requests in a batch. This
   * indicates which quoteRequest the quote is for
   */
  quoteRequestIndex?: number;
  /**
   * Appended to the quote response based on the quote requested featureId
   */
  featureId?: FeatureId;
} & (
    | {
        namespace: KnownCaipNamespace.Eip155;
        chainId: CaipChainId;
        hexChainId?: Hex;
        trade: TxData & {
          data: string;
        };
        approval?: TxData;
        /**
         * Appended to the quote response based on the quote request resetApproval flag
         * If defined, the quote's total network fee will include the reset approval's gas limit.
         */
        resetApproval?: TxData;
      }
    | {
        namespace: KnownCaipNamespace.Solana;
        chainId: CaipChainId;
        trade: string;
      }
    | {
        namespace: KnownCaipNamespace.Tron;
        chainId: CaipChainId;
        trade: TronTradeData & {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          raw_data_hex: string;
        };
        approval?: TronTradeData;
      }
    | {
        namespace: KnownCaipNamespace.Bip122;
        chainId: CaipChainId;
        trade: BitcoinTradeData;
      }
  );
// This ensures the QuoteResponse type is in sync with the QuoteResponseSchemaV2
const QuoteResponse: Describe<QuoteResponse | null> = QuoteResponseSchemaV2;

export const validateQuoteResponse = (
  quoteResponse: unknown,
): quoteResponse is QuoteResponse => {
  // Validate common fields first
  assert(quoteResponse, CommonQuoteResponseSchema);

  const {
    chain: { namespace: namespaceString },
    chainId,
  } = parseCaipAssetType(quoteResponse.quote.src.asset.assetId);

  const namespace = namespaceString as KnownCaipNamespace.Eip155 &
    KnownCaipNamespace.Tron &
    KnownCaipNamespace.Solana &
    KnownCaipNamespace.Bip122;

  // Conditionally validate the trade and approval fields for the chain
  const nameSpaceToTradeSchema = {
    [KnownCaipNamespace.Eip155]: EvmQuoteResponseSchema,
    [KnownCaipNamespace.Tron]: TronQuoteResponseSchema,
    [KnownCaipNamespace.Solana]: SolanaQuoteResponseSchema,
    [KnownCaipNamespace.Bip122]: BitcoinQuoteResponseSchema,
  } as const;

  if (!nameSpaceToTradeSchema[namespace]) {
    return false;
  }

  assert(
    {
      ...quoteResponse,
      namespace,
      chainId,
      hexChainId:
        namespace === KnownCaipNamespace.Eip155
          ? formatChainIdToHex(chainId)
          : undefined,
    },
    nameSpaceToTradeSchema[namespace],
  );
  return true;
};
