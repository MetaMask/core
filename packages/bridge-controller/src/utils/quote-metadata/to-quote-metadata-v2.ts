import { parseCaipAssetType } from '@metamask/utils';

import { toBridgeAssetV2 } from '../../coercers/quote-response-v1-to-v2.js';
import type { DeepPartial } from '../../types.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { getNativeAssetForChainId } from '../bridge.js';
import { calcTokenValue } from '../number-formatters.js';
import type { QuoteMetadata } from './types.js';

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
  const txFeeAsset = quoteResponseV2?.quote?.feeData?.txFee?.[0]?.asset;

  const priceImpactToUse = {
    usd: priceImpact?.usd ?? cost?.usd,
    valueInCurrency: priceImpact?.valueInCurrency ?? cost?.valueInCurrency,
  };
  const networkFeeToUse = gasFee?.total ?? totalNetworkFee;

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
              networkFeeToUse?.amount,
              nativeAsset?.decimals,
            ),
            normalizedAmount: networkFeeToUse?.amount,
            valueInCurrency: networkFeeToUse?.valueInCurrency,
            usd: networkFeeToUse?.usd,
            asset: nativeAsset,
          },
        ],
        ...(relayerFee &&
          Object.values(relayerFee).some(Boolean) && {
            relayer: [
              {
                amount: calcTokenValue(
                  relayerFee?.amount,
                  nativeAsset?.decimals,
                ),
                normalizedAmount: relayerFee.amount,
                valueInCurrency: relayerFee.valueInCurrency,
                usd: relayerFee.usd,
                asset: nativeAsset,
              },
            ],
          }),
        ...(includedTxFees &&
          Object.values(includedTxFees).some(Boolean) && {
            txFee: [
              {
                amount: calcTokenValue(
                  includedTxFees?.amount,
                  txFeeAsset?.decimals,
                ),
                normalizedAmount: includedTxFees?.amount,
                valueInCurrency: includedTxFees?.valueInCurrency,
                usd: includedTxFees?.usd,
                asset: txFeeAsset,
              },
            ],
          }),
      },
      priceData: {
        ...(priceImpactToUse &&
          Object.values(priceImpactToUse).some(Boolean) && {
            priceImpact: priceImpactToUse,
          }),
        ...(adjustedReturn &&
          Object.values(adjustedReturn).some(Boolean) && {
            adjustedReturn: {
              valueInCurrency: adjustedReturn?.valueInCurrency,
              usd: adjustedReturn?.usd,
            },
          }),
        swapRate,
      },
    },
  };
};
