import { is } from '@metamask/superstruct';
import { merge } from 'lodash';

import type { DeepPartial } from '../../types.js';
import { QuoteResponseSchemaV1 } from '../../validators/quote-response-v1.js';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { toNormalizedAmounts } from './to-normalized-amounts.js';
import { toQuoteMetadataV2 } from './to-quote-metadata-v2.js';
import type { QuoteMetadata } from './types.js';

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
    // Phase 2 of migration only uses metadata from the API response
    // @ts-expect-error - this will have a type error until Phase 2 is fully deployed
    return merge({}, quoteResponse, normalizedAmounts, fiatQuoteMetadata);
  }

  // Phase 1.5 of migration uses metadata from the API response but falls back to legacy metadata
  if (migrationPhase === '1.5') {
    return merge(
      {},
      legacyQuoteMetadataV2, // legacy metadata in v2 format
      quoteResponse,
      normalizedAmounts,
      fiatQuoteMetadata, // fiat metadata derived from backend's usd values
      legacyQuoteMetadata, // return legacy metadata for client testing
    );
  }

  // Phase 1 of migration uses calcQuoteMetadata's results (legacy metadata)
  return merge(
    {},
    quoteResponse,
    normalizedAmounts,
    legacyQuoteMetadataV2, // legacy metadata in v2 format
    legacyQuoteMetadata, // return legacy metadata for client testing
  );
}
