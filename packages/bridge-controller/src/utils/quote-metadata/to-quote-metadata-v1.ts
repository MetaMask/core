import { merge } from 'lodash-es';

import type { DeepPartial } from '../../types.js';
import type { AmountsAndAsset } from '../../validators/amount-and-asset.js';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import { isQuoteResponseV2 } from '../../validators/quote-response.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { sumAmounts } from '../number-formatters.js';
import { includeIfTruthy } from './include-if-truthy.js';
import type { QuoteMetadata, TokenAmountValues } from './types.js';
import { QuoteMetadataMigrationPhase } from './types.js';

const toTokenAmountValues = (
  data?: Pick<AmountsAndAsset, 'normalizedAmount' | 'usd' | 'valueInCurrency'>,
): Partial<TokenAmountValues> => {
  return {
    amount: data?.normalizedAmount,
    usd: data?.usd,
    valueInCurrency: data?.valueInCurrency,
  };
};

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
  migrationPhase: QuoteMetadataMigrationPhase = QuoteMetadataMigrationPhase.V1Data,
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
    ...includeIfTruthy(adjustedReturn, { adjustedReturn }),
    ...includeIfTruthy(cost, { cost }),
    ...includeIfTruthy(priceImpact, { priceImpact }),
    ...includeIfTruthy(relayerFee, { relayerFee }),
    ...includeIfTruthy(includedTxFees, { includedTxFees }),
  };

  if (
    migrationPhase === QuoteMetadataMigrationPhase.V1Data ||
    !isQuoteResponseV2(quoteResponse)
  ) {
    return legacyMetadata;
  }

  const { quote } = quoteResponse;
  const { src, dest, priceData, feeData } = quote;
  const { network, relayer, txFee } = feeData;

  const totalNetworkFeeV2 = sumAmounts(network, relayer);

  // Build V1 from V2 quote
  const v2Metadata: QuoteMetadata = {
    ...includeIfTruthy(src, {
      sentAmount: toTokenAmountValues(src),
    }),
    ...includeIfTruthy(dest, {
      toTokenAmount: toTokenAmountValues(dest),
      minToTokenAmount: {
        amount: dest.minAmountNormalized,
        valueInCurrency: dest.minAmountValueInCurrency,
        usd: dest.minAmountUsd,
      },
    }),
    ...includeIfTruthy(priceData?.adjustedReturn, {
      adjustedReturn: toTokenAmountValues(priceData?.adjustedReturn),
    }),
    ...includeIfTruthy(network?.[0], {
      gasFee: {
        total: toTokenAmountValues(network?.[0]),
      },
    }),
    ...includeIfTruthy(totalNetworkFeeV2, {
      totalNetworkFee: toTokenAmountValues(totalNetworkFeeV2),
    }),
    ...includeIfTruthy(priceData?.priceImpact, {
      priceImpact: toTokenAmountValues(priceData?.priceImpact),
    }),
    ...includeIfTruthy(priceData?.cost, {
      cost: toTokenAmountValues(priceData?.cost),
    }),
    ...includeIfTruthy(relayer?.[0], {
      relayerFee: toTokenAmountValues(relayer?.[0]),
    }),
    ...includeIfTruthy(txFee?.[0], {
      includedTxFees: toTokenAmountValues(txFee?.[0]),
    }),
    ...(priceData?.swapRate && { swapRate: priceData.swapRate }),
  };

  if (migrationPhase === QuoteMetadataMigrationPhase.V2WithV1Fallback) {
    return merge({}, legacyMetadata, v2Metadata);
  }

  return v2Metadata;
};
