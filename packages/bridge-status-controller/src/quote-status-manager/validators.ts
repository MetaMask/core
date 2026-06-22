import {
  string,
  number,
  enums,
  union,
  type,
  assert,
} from '@metamask/superstruct';

import {
  BaseQuoteStatusUpdateErrorTypes,
  QuoteStatusUpdateBackendOnChainMismatchTypes,
  QuoteStatusUpdateStatusBackendValues,
} from './constants';
import { QuoteStatusUpdateResponse } from './types';

const QuoteStatusUpdateResponseWithCurrentStatusSchema = type({
  statusCode: number(),
  message: string(),
  type: enums(QuoteStatusUpdateBackendOnChainMismatchTypes),
  currentStatus: enums(QuoteStatusUpdateStatusBackendValues),
  newStatus: enums(QuoteStatusUpdateStatusBackendValues),
});

const QuoteStatusUpdateResponseBaseSchema = type({
  statusCode: number(),
  message: string(),
  type: enums(BaseQuoteStatusUpdateErrorTypes),
});

export const QuoteStatusUpdateResponseSchema = union([
  QuoteStatusUpdateResponseWithCurrentStatusSchema,
  QuoteStatusUpdateResponseBaseSchema,
]);

export function validateQuoteStatusUpdateResponse(
  data: unknown,
): asserts data is QuoteStatusUpdateResponse {
  assert(data, QuoteStatusUpdateResponseSchema);
}
