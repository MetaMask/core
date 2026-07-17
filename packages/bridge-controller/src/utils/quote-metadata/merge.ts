import { merge } from 'lodash';

import type { QuoteResponseV1 } from '../../validators/quote-response-v1';
import type { QuoteMetadata } from './types';

/**
 * Merges legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponseV2 - The {@link QuoteResponse} to merge the metadata into
 * @param quoteMetadata - The {@link QuoteMetadata} values to merge
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export function mergeQuoteMetadata(
  quoteResponseV2: QuoteResponseV1,
  quoteMetadata: QuoteMetadata,
): QuoteResponseV1 & QuoteMetadata {
  return merge({}, quoteResponseV2, quoteMetadata);
}
