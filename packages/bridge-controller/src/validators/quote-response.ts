import {
  assert,
  Infer,
  number,
  optional,
  string,
  type,
  union,
  intersection,
  Describe,
  nullable,
  enums,
  literal,
  AnyStruct,
} from '@metamask/superstruct';
import {
  CaipChainId,
  CaipChainIdStruct,
  KnownCaipNamespace,
  parseCaipAssetType,
  StrictHexStruct,
} from '@metamask/utils';

import { FeatureId } from './feature-flags';
import { FloatStringSchema } from './number';
import { QuoteSchemaV2 } from './quote';
import {
  BitcoinTradeData,
  BitcoinTradeDataSchema,
  StellarTradeData,
  StellarTradeDataSchema,
  TronTradeData,
  TronTradeDataSchema,
  TxData,
  TxDataSchema,
} from './trade';

const CommonQuoteResponseSchema = type({
  quoteId: optional(string()),
  quote: QuoteSchemaV2,
  estimatedProcessingTimeInSeconds: number(),
  /**
   * Appended to the quote if there are multiple quote requests in a batch. This
   * indicates which quoteRequest the quote is for
   */
  quoteRequestIndex: optional(number()),
  /**
   * Appended to the quote response based on the quote requested featureId
   */
  featureId: optional(enums(Object.values(FeatureId))),
  /**
   * Appended to the quote response based on the quote request nonEvmFeesInNative flag
   *
   * @deprecated Use network feeData
   */
  nonEvmFeesInNative: optional(FloatStringSchema),
  /**
   * Appended to the quote response based on the quote request l1GasFeesInHexWei flag
   *
   * @deprecated Use network feeData
   */
  l1GasFeesInHexWei: optional(StrictHexStruct),
});

const EvmQuoteResponseSchema = intersection([
  CommonQuoteResponseSchema,
  type({
    namespace: literal(KnownCaipNamespace.Eip155),
    chainId: CaipChainIdStruct,
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
    approval: optional(TxDataSchema),
  }),
]);

const BitcoinQuoteResponseSchema = intersection([
  CommonQuoteResponseSchema,
  type({
    namespace: literal(KnownCaipNamespace.Bip122),
    chainId: CaipChainIdStruct,
    trade: BitcoinTradeDataSchema,
    approval: optional(TxDataSchema),
  }),
]);

const StellarQuoteResponseSchema = intersection([
  CommonQuoteResponseSchema,
  type({
    namespace: literal(KnownCaipNamespace.Stellar),
    chainId: CaipChainIdStruct,
    trade: StellarTradeDataSchema,
    approval: optional(TxDataSchema),
  }),
]);

export const QuoteResponseSchemaV2 = nullable(
  union([
    EvmQuoteResponseSchema,
    SolanaQuoteResponseSchema,
    TronQuoteResponseSchema,
    BitcoinQuoteResponseSchema,
    StellarQuoteResponseSchema,
  ]),
);

/**
 * This is the V2 QuoteResponse type, including metadata calculated after quote fetch
 */
export type QuoteResponse = Omit<
  NonNullable<Infer<typeof QuoteResponseSchemaV2>>,
  'trade' | 'approval' | 'resetApproval'
> &
  (
    | {
        namespace: KnownCaipNamespace.Eip155;
        chainId: CaipChainId;
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
        approval?: TxData;
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
        approval?: TxData;
      }
    | {
        namespace: KnownCaipNamespace.Stellar;
        chainId: CaipChainId;
        trade: StellarTradeData;
        approval?: TxData;
      }
  );
// This ensures the QuoteResponse type is in sync with the QuoteResponseSchemaV2
const QuoteResponse: Describe<QuoteResponse | null> = QuoteResponseSchemaV2;

const NAMESPACE_TO_TRADE_SCHEMA: Record<QuoteResponse['namespace'], AnyStruct> =
  {
    [KnownCaipNamespace.Eip155]: EvmQuoteResponseSchema,
    [KnownCaipNamespace.Tron]: TronQuoteResponseSchema,
    [KnownCaipNamespace.Solana]: SolanaQuoteResponseSchema,
    [KnownCaipNamespace.Bip122]: BitcoinQuoteResponseSchema,
    [KnownCaipNamespace.Stellar]: StellarQuoteResponseSchema,
  };

export const validateQuoteResponse = (
  quoteResponse: unknown,
): quoteResponse is QuoteResponse => {
  // Validate common fields first
  assert(quoteResponse, CommonQuoteResponseSchema);

  // Extract the namespace and chainId from the src asset
  const {
    chain: { namespace: namespaceString },
    chainId,
  } = parseCaipAssetType(quoteResponse.quote.src.asset.assetId);
  const namespace = namespaceString as QuoteResponse['namespace'];

  if (!NAMESPACE_TO_TRADE_SCHEMA[namespace]) {
    return false;
  }

  // Validate the trade and approval fields based on the src chain's namespace
  assert(
    {
      ...quoteResponse,
      namespace,
      chainId,
    },
    NAMESPACE_TO_TRADE_SCHEMA[namespace],
  );
  return true;
};
