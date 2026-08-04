import { is } from '@metamask/superstruct';
import { merge } from 'lodash';

import type { DeepPartial } from '../../types.js';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import { QuoteResponseSchemaV2 } from '../../validators/quote-response.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { sumAmounts } from '../number-formatters.js';
import type { QuoteMetadata } from './types.js';

/**
 * Extracts legacy {@link QuoteMetadata} values from a {@link QuoteResponse} or {@link QuoteResponseV1}.
 * If a QuoteResponse is provided, this assumes that its `valueInCurrency` properties are set.
 *
 * @param quoteResponse - The quote to extract the metadata from
 * @param migrationPhase - The migration phase to use
 * @returns A partial {@link QuoteMetadata} object
 */
export const toQuoteMetadataV1 = (
  quoteResponse:
    | (DeepPartial<QuoteResponse | QuoteResponseV1> & QuoteMetadata)
    | null,
  migrationPhase: '1' | '1.5' | '2' = '1',
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

  // Build V1 from V2 quote
  if (is(quoteResponse, QuoteResponseSchemaV2) && migrationPhase !== '1') {
    const totalNetworkFeeV2 = sumAmounts(
      quoteResponse?.quote?.feeData?.network,
      quoteResponse?.quote?.feeData?.relayer,
    );
    const v2Metadata: QuoteMetadata | undefined = {
      sentAmount: {
        amount: quoteResponse?.quote?.src?.normalizedAmount,
        usd: quoteResponse?.quote?.src?.usd,
        valueInCurrency: quoteResponse?.quote?.src?.valueInCurrency,
      },
      toTokenAmount: {
        amount: quoteResponse?.quote?.dest?.normalizedAmount,
        usd: quoteResponse?.quote?.dest?.usd,
        valueInCurrency: quoteResponse?.quote?.dest?.valueInCurrency,
      },
      minToTokenAmount: {
        amount: quoteResponse?.quote?.dest?.minAmountNormalized,
        valueInCurrency: quoteResponse?.quote?.dest?.minAmountValueInCurrency,
        usd: quoteResponse?.quote?.dest?.minAmountUsd,
      },
      swapRate: quoteResponse?.quote?.priceData?.swapRate,
      adjustedReturn: {
        usd: quoteResponse?.quote?.priceData?.adjustedReturn?.usd,
        valueInCurrency:
          quoteResponse?.quote?.priceData?.adjustedReturn?.valueInCurrency ??
          undefined,
      },
      cost: {
        valueInCurrency:
          quoteResponse?.quote?.priceData?.priceImpact?.valueInCurrency ??
          undefined,
        usd: quoteResponse?.quote?.priceData?.priceImpact?.usd,
      },
      gasFee: {
        total: {
          amount:
            quoteResponse?.quote?.feeData?.network?.[0]?.normalizedAmount ??
            undefined,
          usd: quoteResponse?.quote?.feeData?.network?.[0]?.usd,
          valueInCurrency:
            quoteResponse?.quote?.feeData?.network?.[0]?.valueInCurrency ??
            undefined,
        },
      },
      totalNetworkFee: {
        amount: totalNetworkFeeV2?.normalizedAmount,
        usd: totalNetworkFeeV2?.usd,
        valueInCurrency: totalNetworkFeeV2?.valueInCurrency,
      },
      priceImpact: {
        usd: quoteResponse?.quote?.priceData?.priceImpact?.usd,
        valueInCurrency:
          quoteResponse?.quote?.priceData?.priceImpact?.valueInCurrency ??
          undefined,
      },
      relayerFee: {
        amount:
          quoteResponse?.quote?.feeData?.relayer?.[0]?.normalizedAmount ??
          undefined,
        usd: quoteResponse?.quote?.feeData?.relayer?.[0]?.usd,
        valueInCurrency:
          quoteResponse?.quote?.feeData?.relayer?.[0]?.valueInCurrency ??
          undefined,
      },
      includedTxFees: {
        amount: quoteResponse?.quote?.feeData?.txFee?.[0]?.normalizedAmount,
        usd: quoteResponse?.quote?.feeData?.txFee?.[0]?.usd,
        valueInCurrency:
          quoteResponse?.quote?.feeData?.txFee?.[0]?.valueInCurrency ??
          undefined,
      },
    };

    if (migrationPhase === '1.5') {
      // Phase 1.5 uses legacyMetadata as fallback
      return merge({}, legacyMetadata, v2Metadata);
    }

    // Phase 2 only uses metadata from the API response
    if (migrationPhase === '2' && v2Metadata) {
      return v2Metadata;
    }
  }

  // Return legacy metadata as-is, extract from quote
  return merge({}, legacyMetadata);
};
