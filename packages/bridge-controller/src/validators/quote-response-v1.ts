import type { Infer } from '@metamask/superstruct';
import {
  string,
  number,
  type,
  optional,
  enums,
  union,
  assert,
} from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';

import { FeatureId } from './feature-flags.js';
import { FloatStringSchema } from './number.js';
import { QuoteSchema } from './quote.js';
import {
  TxDataSchema,
  TronTradeDataSchema,
  BitcoinTradeDataSchema,
  StellarTradeDataSchema,
} from './trade.js';
import type {
  BitcoinTradeData,
  StellarTradeData,
  TronTradeData,
  TxData,
} from './trade.js';

export const QuoteResponseSchemaV1 = type({
  featureId: optional(enums(Object.values(FeatureId))),
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
  l1GasFeesInHexWei: optional(StrictHexStruct),
  nonEvmFeesInNative: optional(FloatStringSchema),
});

export const validateQuoteResponseV1 = (
  data: unknown,
): data is Infer<typeof QuoteResponseSchemaV1> => {
  assert(data, QuoteResponseSchemaV1);
  return true;
};

/**
 * This is the type for the quote response from the bridge-api
 * TxDataType can be overriden to be a string when the quote is non-evm
 * ApprovalType can be overriden when you know the specific approval type (e.g., TxData for EVM-only contexts)
 *
 * @deprecated Use `QuoteResponseV2` instead
 */
export type QuoteResponseV1<
  TxDataType =
    | TxData
    | string
    | BitcoinTradeData
    | TronTradeData
    | StellarTradeData,
  ApprovalType = TxData | TronTradeData,
> = Infer<typeof QuoteResponseSchemaV1> & {
  trade: TxDataType;
  approval?: ApprovalType;
  /**
   * Appended to the quote response based on the quote request
   */
  featureId?: FeatureId;
  /**
   * Appended to the quote response based on the quote request resetApproval flag
   * If defined, the quote's total network fee will include the reset approval's gas limit.
   */
  resetApproval?: TxData;
  /**
   * Appended to the quote if there are multiple quote requests in a batch. This
   * indicates which quoteRequest the quote is for
   */
  quoteRequestIndex?: number;
};
