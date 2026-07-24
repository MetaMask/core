import { is } from '@metamask/superstruct';
import { merge } from 'lodash';

import type { QuoteResponse } from '../../validators/quote-response';
import { QuoteResponseSchemaV1 } from '../../validators/quote-response-v1';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1';
import { toNormalizedAmounts } from './to-normalized-amounts';
import { toQuoteMetadataV2 } from './to-quote-metadata-v2';
import type { QuoteMetadata } from './types';
import type { DeepPartial } from '../../types';

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

  const legacyQuoteMetadatV2 = toQuoteMetadataV2(
    legacyQuoteMetadata,
    quoteResponse,
  );
  const normalizedAmountsV2 = toNormalizedAmounts(quoteResponse);

  if (migrationPhase === '2') {
    // TODO Phase 2 of migration only uses metadata from the API response
    // @ts-expect-error - TODO: fix this
    return merge({}, quoteResponse, normalizedAmountsV2, fiatQuoteMetadata);
  }

  if (migrationPhase === '1.5') {
    return merge(
      {},
      legacyQuoteMetadatV2,
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
    normalizedAmountsV2,
    legacyQuoteMetadatV2,
    legacyQuoteMetadata, // return for client testing
  );
}
