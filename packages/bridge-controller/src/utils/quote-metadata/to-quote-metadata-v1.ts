import { merge } from 'lodash';

import type { DeepPartial } from '../../types.js';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import type { QuoteMetadata } from './types.js';

/**
 * Extracts legacy {@link QuoteMetadata} values from a {@link QuoteResponse} or {@link QuoteResponseV1}.
 * If a QuoteResponse is provided, this assumes that its `valueInCurrency` properties are set.
 *
 * @param quoteResponse - The quote to extract the metadata from
 * @returns A partial {@link QuoteMetadata} object
 */
export const toQuoteMetadataV1 = (
  quoteResponse:
    | (DeepPartial<QuoteResponse | QuoteResponseV1> & QuoteMetadata)
    | null,
): QuoteMetadata => {
  /* istanbul ignore if */
  if (!quoteResponse) {
    return {};
  }

  const {
    toTokenAmount,
    minToTokenAmount,
    sentAmount,
    swapRate,
    adjustedReturn,
    cost,
    includedTxFees,
    relayerFee,
    totalNetworkFee,
    gasFee,
    priceImpact,
  } = quoteResponse;

  const legacyMetadata = {
    sentAmount,
    toTokenAmount,
    minToTokenAmount,
    swapRate,
    gasFee,
    totalNetworkFee,
    ...(adjustedReturn && Object.values(adjustedReturn).some(Boolean)
      ? { adjustedReturn }
      : {}),
    ...(cost && Object.values(cost).some(Boolean) ? { cost } : {}),
    ...(priceImpact && Object.values(priceImpact).some(Boolean)
      ? { priceImpact }
      : {}),
    ...(relayerFee && Object.values(relayerFee).some(Boolean)
      ? { relayerFee }
      : {}),
    ...(includedTxFees && Object.values(includedTxFees).some(Boolean)
      ? { includedTxFees }
      : {}),
  };

  // Phase 1 only uses legacyMetadata
  return merge({}, legacyMetadata);
};
