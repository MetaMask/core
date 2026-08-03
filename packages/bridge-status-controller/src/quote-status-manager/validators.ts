import {
  string,
  number,
  enums,
  union,
  type,
  assert,
  optional,
} from '@metamask/superstruct';

import { StatusResponseSchema } from '../utils/validators.js';
import {
  BaseQuoteStatusUpdateErrorTypes,
  QuoteStatusUpdateBackendOnChainMismatchTypes,
  QuoteStatusBackendValues,
} from './constants.js';
import { QuoteStatusGetResponse, QuoteStatusUpdateResponse } from './types.js';

const QuoteStatusUpdateResponseWithCurrentStatusSchema = type({
  statusCode: number(),
  message: string(),
  type: enums(QuoteStatusUpdateBackendOnChainMismatchTypes),
  currentStatus: enums(QuoteStatusBackendValues),
  newStatus: enums(QuoteStatusBackendValues),
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

/**
 * **Note**: This struct is big and not all fields are used atm.
 * For that reason we have decided to only include the fields we
 * consume in production. In the future, once we need it to be strongly type,
 * we will refactor.
 */
export const QuoteStatusGetResponseSchema = type({
  /**
   * Submitted transaction: StatusResponseDto with at least srcChain (chainId + txHash).
   * Prefilled by updateQuoteStatus; replaced with full provider status by getQuoteStatus.
   */
  submittedTx: optional(StatusResponseSchema),
});

export function validateQuoteStatusGetResponse(
  data: unknown,
): asserts data is QuoteStatusGetResponse {
  assert(data, QuoteStatusGetResponseSchema);
}
