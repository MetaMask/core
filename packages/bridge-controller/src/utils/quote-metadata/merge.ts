import { merge } from 'lodash';

import type { DeepPartial } from '../../types.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { includeIfTruthy } from './include-if-truthy.js';
import { toNormalizedAmounts } from './to-normalized-amounts.js';
import { toQuoteMetadataV2 } from './to-quote-metadata-v2.js';
import type { QuoteMetadata } from './types.js';
import { QuoteMetadataMigrationPhase } from './types.js';

/**
 * Merges legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponse - The {@link QuoteResponse} to merge the metadata into
 * @param legacyQuoteMetadata - The {@link QuoteMetadata} values to merge
 * @param migrationPhase - The active {@link QuoteMetadataMigrationPhase}
 * @param currencyValues - The amounts in the user's currency, derived from the backend's `usd` values
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export function mergeQuoteMetadata(
  quoteResponse: QuoteResponse,
  legacyQuoteMetadata: QuoteMetadata = {},
  migrationPhase: QuoteMetadataMigrationPhase = QuoteMetadataMigrationPhase.V1Data,
  currencyValues?: DeepPartial<QuoteResponse>,
): QuoteResponse & QuoteMetadata {
  if (migrationPhase === QuoteMetadataMigrationPhase.V2Only) {
    return merge(
      {},
      quoteResponse,
      toNormalizedAmounts(quoteResponse),
      currencyValues,
    );
  }

  const legacyQuoteMetadataV2 = toQuoteMetadataV2(
    legacyQuoteMetadata,
    quoteResponse,
  );

  if (migrationPhase === QuoteMetadataMigrationPhase.V2WithV1Fallback) {
    return merge(
      {},
      legacyQuoteMetadataV2,
      legacyQuoteMetadata, // legacyQuoteMetadata is returned for testing purposes only
      quoteResponse,
      toNormalizedAmounts(quoteResponse),
      currencyValues,
    );
  }

  // Sanitize the bridge-api's quote response by removing fee and price data that will be replaced with legacy metadata values
  const { quote, ...restQuoteResponse } = quoteResponse;
  const { feeData, priceData, ...restQuote } = quote ?? {};

  const txFeeGasParams = {
    maxFeePerGas: feeData?.txFee?.[0]?.maxFeePerGas,
    maxPriorityFeePerGas: feeData?.txFee?.[0]?.maxPriorityFeePerGas,
  };
  const txFeeData = includeIfTruthy(txFeeGasParams, {
    txFee: [txFeeGasParams],
  });

  const metabridgeFeeData = includeIfTruthy(feeData?.metabridge[0], {
    metabridge: feeData?.metabridge,
  });

  const priceImpactData = priceData?.priceImpact?.amount && {
    priceData: {
      priceImpact: {
        amount: priceData?.priceImpact?.amount,
      },
    },
  };

  const sanitizedQuoteResponseV2 = {
    quote: {
      ...restQuote,
      feeData: {
        ...(metabridgeFeeData ?? {}),
        ...(txFeeData ?? {}),
      },
      ...(priceImpactData ?? {}),
    },
  };
  return merge(
    {},
    restQuoteResponse,
    sanitizedQuoteResponseV2,
    toNormalizedAmounts(sanitizedQuoteResponseV2),
    legacyQuoteMetadataV2,
    legacyQuoteMetadata,
  );
}
