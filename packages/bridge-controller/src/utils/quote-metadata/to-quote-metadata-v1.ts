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
  quoteResponse: DeepPartial<QuoteResponse | QuoteResponseV1> & QuoteMetadata,
): QuoteMetadata => {
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
    adjustedReturn,
    cost,
    gasFee,
    totalNetworkFee,
    priceImpact,
    ...(relayerFee && { relayerFee }),
    ...(includedTxFees && { includedTxFees }),
  };

  // Phase 1 only uses legacyMetadata
  return merge({}, legacyMetadata);

  // TODO Phase 1.5 uses legacyMetadata as fallback
  // return merge(
  //   {},
  //   legacyMetadata,
  //   toQuoteMetadataV1(quoteResponse),
  // );

  // TODO Phase 2 only uses metadata from the API response
  // return quoteResponse;
};
