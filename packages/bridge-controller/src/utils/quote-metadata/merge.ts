import { is } from '@metamask/superstruct';
import { merge } from 'lodash';

import { QuoteResponseSchemaV1 } from '../../validators/quote-response-v1.js';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { toNormalizedAmounts } from './to-normalized-amounts.js';
import { toQuoteMetadataV2 } from './to-quote-metadata-v2.js';
import type { QuoteMetadata } from './types.js';
import { toNormalizedAmounts } from './to-normalized-amounts.js';
import type { DeepPartial } from '../../types.js';

/**
 * Merges legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponse - The {@link QuoteResponse} or {@link QuoteResponseV1} to merge the metadata into
 * @param legacyQuoteMetadata - The {@link QuoteMetadata} values to merge
 * @param migrationPhase - The migration phase
 * @param fiatQuoteMetadata - The {@link QuoteMetadataV2} values to merge
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export function mergeQuoteMetadata<
  QuoteType extends QuoteResponse | QuoteResponseV1 = QuoteResponse,
>(
  quoteResponse: QuoteType,
  legacyQuoteMetadata: QuoteMetadata,
  migrationPhase: '1' | '1.5' | '2' = '1',
  fiatQuoteMetadata?: DeepPartial<QuoteResponse>,
): QuoteType & QuoteMetadata {
  if (is(quoteResponse, QuoteResponseSchemaV1)) {
    return merge({}, quoteResponse, legacyQuoteMetadata);
  }

  const legacyQuoteMetadataV2 = toQuoteMetadataV2(
    legacyQuoteMetadata,
    quoteResponse,
  );

  const normalizedAmounts = toNormalizedAmounts(quoteResponse);

  if (migrationPhase === '2') {
    // TODO Phase 2 of migration only uses metadata from the API response
    // @ts-expect-error - TODO: fix this
    return merge({}, quoteResponse, normalizedAmountsV2, fiatQuoteMetadata);
  }

  if (migrationPhase === '1.5') {
    // console.log('====', {
    //   legacyQuoteMetadataV2: legacyQuoteMetadataV2.quote?.priceData,
    //   quoteResponse: quoteResponse.quote?.priceData,
    //   normalizedAmountsV2: normalizedAmountsV2.quote?.priceData,
    //   fiatQuoteMetadata: fiatQuoteMetadata?.quote?.priceData,
    //   legacyQuoteMetadata: legacyQuoteMetadata?.priceImpact,
    // });
    return merge(
      {},
      legacyQuoteMetadataV2,
      quoteResponse,
      normalizedAmountsV2,
      fiatQuoteMetadata,
      legacyQuoteMetadata, // return for client testing
    );
  }

  // Phase 1 of migration uses calcQuoteMetadata's results
  return merge(
    {},
    quoteResponse,
    normalizedAmounts,
    legacyQuoteMetadataV2, // legacy metadata in v2 format
    legacyQuoteMetadata, // return legacy metadata for client testing
  );
}
