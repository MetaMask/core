import { parseCaipAssetType } from '@metamask/utils';

import { toBridgeAssetV2 } from '../../coercers/quote-response-v1-to-v2';
import type { DeepPartial } from '../../types';
import type { QuoteResponse } from '../../validators/quote-response';
import { getNativeAssetForChainId } from '../bridge';
import { calcTokenValue } from '../number-formatters';
import type { QuoteMetadata } from './types';

/**
 * Converts a {@link QuoteMetadata} to a partial {@link QuoteResponse} containing only metadata
 *
 * @param quoteMetadata - The {@link QuoteMetadata} to convert
 * @param quoteResponseV2 - The {@link QuoteResponse} to use for token data
 * @returns The {@link DeepPartial<QuoteResponse>}
 */
export const toQuoteMetadataV2 = (
  quoteMetadata: QuoteMetadata,
  quoteResponseV2?: DeepPartial<QuoteResponse>,
): DeepPartial<QuoteResponse> => {
  const {
    sentAmount,
    toTokenAmount,
    minToTokenAmount,
    swapRate,
    totalNetworkFee,
    gasFee,
    adjustedReturn,
    cost,
    includedTxFees,
    relayerFee,
    priceImpact,
    ...rest
  } = quoteMetadata;

  const srcAsset = quoteResponseV2?.quote?.src?.asset;
  const destAsset = quoteResponseV2?.quote?.dest?.asset;

  const chainId = srcAsset?.assetId
    ? parseCaipAssetType(srcAsset.assetId)?.chainId
    : undefined;
  const nativeAsset = chainId
    ? toBridgeAssetV2(getNativeAssetForChainId(chainId))
    : undefined;

  return {
    ...rest,
    quote: {
      src: {
        amount: calcTokenValue(sentAmount?.amount, srcAsset?.decimals),
        normalizedAmount: sentAmount?.amount,
        valueInCurrency: sentAmount?.valueInCurrency,
        usd: sentAmount?.usd,
      },
      dest: {
        amount: calcTokenValue(toTokenAmount?.amount, destAsset?.decimals),
        normalizedAmount: toTokenAmount?.amount,
        valueInCurrency: toTokenAmount?.valueInCurrency,
        usd: toTokenAmount?.usd,
        minAmount: calcTokenValue(
          minToTokenAmount?.amount,
          destAsset?.decimals,
        ),
        minAmountNormalized: minToTokenAmount?.amount,
        minAmountUsd: minToTokenAmount?.usd,
        minAmountValueInCurrency: minToTokenAmount?.valueInCurrency,
      },
      feeData: {
        network: [
          {
            amount: calcTokenValue(
              gasFee?.total?.amount ?? totalNetworkFee?.amount,
              nativeAsset?.decimals,
            ),
            normalizedAmount: gasFee?.total?.amount ?? totalNetworkFee?.amount,
            valueInCurrency:
              gasFee?.total?.valueInCurrency ??
              totalNetworkFee?.valueInCurrency,
            usd: gasFee?.total?.usd ?? totalNetworkFee?.usd,
            asset: nativeAsset,
          },
        ],
        relayer: [
          {
            amount: calcTokenValue(relayerFee?.amount, nativeAsset?.decimals),
            normalizedAmount: relayerFee?.amount,
            valueInCurrency: relayerFee?.valueInCurrency,
            usd: relayerFee?.usd,
            asset: nativeAsset,
          },
        ],
        ...(includedTxFees && {
          txFee: [
            {
              amount: calcTokenValue(
                includedTxFees?.amount,
                nativeAsset?.decimals,
              ),
              normalizedAmount: includedTxFees?.amount,
              valueInCurrency: includedTxFees?.valueInCurrency,
              usd: includedTxFees?.usd,
            },
          ],
        }),
      },
      priceData: {
        priceImpact: {
          valueInCurrency:
            cost?.valueInCurrency ?? priceImpact?.valueInCurrency,
          usd: cost?.usd ?? priceImpact?.usd,
        },
        adjustedReturn: {
          valueInCurrency: adjustedReturn?.valueInCurrency,
          usd: adjustedReturn?.usd,
        },
        swapRate,
      },
    },
  };
};
