/* eslint-disable @typescript-eslint/naming-convention */
import {
  type,
  number,
  boolean,
  optional,
  enums,
  record,
  string,
  any,
  assert,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

export enum QuoteStreamCompleteReason {
  RETRY = 'RETRY',
  AMOUNT_TOO_HIGH = 'AMOUNT_TOO_HIGH',
  AMOUNT_TOO_LOW = 'AMOUNT_TOO_LOW',
  SLIPPAGE_TOO_HIGH = 'SLIPPAGE_TOO_HIGH',
  SLIPPAGE_TOO_LOW = 'SLIPPAGE_TOO_LOW',
  TOKEN_NOT_SUPPORTED = 'TOKEN_NOT_SUPPORTED',
  RWA_GEO_RESTRICTED = 'RWA_GEO_RESTRICTED',
  RWA_NATIVE_TOKEN_UNSUPPORTED = 'RWA_NATIVE_TOKEN_UNSUPPORTED',
  RWA_MARKET_UNAVAILABLE = 'RWA_MARKET_UNAVAILABLE',
}

export const QuoteStreamCompleteSchema = type({
  quoteCount: number(),
  hasQuotes: boolean(),
  reason: optional(enums(Object.values(QuoteStreamCompleteReason))),
  context: optional(record(string(), any())),
});

export const validateQuoteStreamComplete = (
  data: unknown,
): data is Infer<typeof QuoteStreamCompleteSchema> => {
  assert(data, QuoteStreamCompleteSchema);
  return true;
};
