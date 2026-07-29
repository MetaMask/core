import { merge } from 'lodash';

import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import type { QuoteMetadata } from './types.js';

/**
 * Merges legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponse - The {@link QuoteResponseV1} to merge the metadata into
 * @param quoteMetadata - The {@link QuoteMetadata} values to merge
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export function mergeQuoteMetadata(
  quoteResponse: QuoteResponseV1,
  quoteMetadata: QuoteMetadata,
): QuoteResponseV1 & QuoteMetadata {
  return merge({}, quoteResponse, quoteMetadata);
}
