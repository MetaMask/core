import { parseCaipAssetType } from '@metamask/utils';

import { toBridgeAssetV2 } from '../../coercers/quote-response-v1-to-v2.js';
import type { DeepPartial } from '../../types.js';
import type { AmountsAndAsset } from '../../validators/amount-and-asset.js';
import type { BridgeAssetV2 } from '../../validators/bridge-asset.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { getNativeAssetForChainId } from '../bridge.js';
import { calcAtomicTokenAmount } from '../number-formatters.js';
import { includeIfTruthy } from './include-if-truthy.js';
import type { QuoteMetadata, TokenAmountValues } from './types.js';

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

  const toAmountAndAsset = (
    asset?: DeepPartial<BridgeAssetV2>,
    metadata?: Partial<TokenAmountValues>,
    extraFields?: DeepPartial<AmountsAndAsset>,
  ): DeepPartial<AmountsAndAsset> => {
    return {
      amount: calcAtomicTokenAmount(metadata?.amount, asset?.decimals),
      normalizedAmount: metadata?.amount,
      valueInCurrency: metadata?.valueInCurrency,
      usd: metadata?.usd,
      ...extraFields,
    };
  };

  return {
    ...rest,
    quote: {
      src: toAmountAndAsset(srcAsset, sentAmount),
      dest: {
        ...toAmountAndAsset(destAsset, toTokenAmount),
        minAmount: calcAtomicTokenAmount(
          minToTokenAmount?.amount,
          destAsset?.decimals,
        ),
        minAmountNormalized: minToTokenAmount?.amount,
        minAmountUsd: minToTokenAmount?.usd,
        minAmountValueInCurrency: minToTokenAmount?.valueInCurrency,
      },
      feeData: {
        network: [
          toAmountAndAsset(nativeAsset, networkFeeToUse, {
            asset: nativeAsset,
          }),
        ],
        ...includeIfTruthy(relayerFee, {
          relayer: [
            toAmountAndAsset(nativeAsset, relayerFee, { asset: nativeAsset }),
          ],
        }),
        ...includeIfTruthy(includedTxFees, {
          txFee: [
            toAmountAndAsset(txFeeAsset, includedTxFees, { asset: txFeeAsset }),
          ],
        }),
      },
      priceData: {
        ...includeIfTruthy(priceImpactToUse, {
          priceImpact: priceImpactToUse,
        }),
        ...includeIfTruthy(adjustedReturn, {
          adjustedReturn,
        }),
        swapRate,
      },
    },
  };
};
