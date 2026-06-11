import { create, coerce } from '@metamask/superstruct';
import { KnownCaipNamespace, parseCaipAssetType } from '@metamask/utils';

import { QuoteMetadata } from '../types';
import { getNativeAssetForChainId } from '../utils/bridge';
import { formatChainIdToHex } from '../utils/caip-formatters';
import { calcTokenValue } from '../utils/quote';
import { BridgeAssetV2FromV1 } from './bridge-asset';
import { FeatureId } from './feature-flags';
import {
  FeeType,
  QuoteResponseSchemaV1,
  QuoteResponseV1,
  StepSchema,
} from './quote-response';
import {
  QuoteResponse,
  QuoteResponseSchemaV2,
  StepSchemaV2,
} from './quote-response-v2';

const StepSchemaV2FromV1 = coerce(StepSchemaV2, StepSchema, (value) => {
  const { srcChainId, destChainId, action } = value;
  return {
    srcChainId,
    destChainId,
    action,
  };
});

const QuoteResponseV2FromV1 = coerce(
  QuoteResponseSchemaV2,
  QuoteResponseSchemaV1,
  (value: QuoteResponseV1) => {
    const { quote, l1GasFeesInHexWei, nonEvmFeesInNative, ...rest } = value;
    const {
      srcTokenAmount,
      destTokenAmount,
      minDestTokenAmount,
      srcAsset,
      destAsset,
      srcChainId,
      destChainId,
      walletAddress,
      destWalletAddress,
      priceData,
      feeData,
      bridgeId,
      bridges,
      steps,
      ...restQuote
    } = quote;

    const {
      chain: { namespace },
      chainId,
    } = parseCaipAssetType(srcAsset.assetId);

    return {
      ...rest,
      ...(nonEvmFeesInNative ? { nonEvmFeesInNative } : {}),
      ...(l1GasFeesInHexWei ? { l1GasFeesInHexWei } : {}),
      namespace,
      chainId,
      hexChainId:
        namespace === KnownCaipNamespace.Eip155
          ? formatChainIdToHex(chainId)
          : undefined,
      quote: {
        protocols: bridges,
        aggregator: bridgeId,
        src: {
          amount: srcTokenAmount,
          asset: create(srcAsset, BridgeAssetV2FromV1),
          walletAddress,
        },
        dest: {
          amount: destTokenAmount,
          asset: create(destAsset, BridgeAssetV2FromV1),
          walletAddress: destWalletAddress,
          min: {
            amount: minDestTokenAmount,
          },
        },
        priceData: {
          priceImpact: {
            amount: value.quote.priceData?.priceImpact,
          },
        },
        feeData: {
          [FeeType.METABRIDGE]: [
            {
              ...feeData[FeeType.METABRIDGE],
              asset: create(
                feeData[FeeType.METABRIDGE].asset,
                BridgeAssetV2FromV1,
              ),
              usd: priceData?.totalFeeAmountUsd,
            },
          ],
          [FeeType.TX_FEE]: [
            ...(feeData[FeeType.TX_FEE]
              ? [
                  {
                    ...feeData[FeeType.TX_FEE],
                    asset: create(
                      feeData[FeeType.TX_FEE].asset,
                      BridgeAssetV2FromV1,
                    ),
                  },
                ]
              : []),
          ],
        },
        /**
         * @deprecated This field is deprecated.
         */
        steps: steps
          ? steps.map((step) => create(step, StepSchemaV2FromV1))
          : undefined,
        ...restQuote,
      },
    };
  },
);

/**
 * Converts a {@link QuoteResponseV1} to a {@link QuoteResponseV2}
 *
 * @param quoteResponse - The {@link QuoteResponseV1} to convert
 * @param featureId - The {@link FeatureId} of the quote response
 * @returns The {@link QuoteResponseV2}
 */
export const toQuoteResponseV2 = (
  quoteResponse: unknown,
  featureId?: FeatureId,
): QuoteResponse => {
  const quoteResponseV2 = create(quoteResponse, QuoteResponseV2FromV1);
  if (!quoteResponseV2) {
    throw new Error('Invalid quote response');
  }
  return { ...quoteResponseV2, featureId };
};

/**
 * Inserts legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponse - The {@link QuoteResponse} to merge the metadata into
 * @param quoteResponse.quote - The {@link Quote} to merge the metadata into
 * @param expectedQuoteMetadata - The {@link QuoteMetadata} values to merge
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export const mergeQuoteMetadata = (
  { quote, ...restOfQuoteResponse }: QuoteResponse,
  expectedQuoteMetadata: Partial<QuoteMetadata>,
): QuoteResponse => {
  const srcChainId = parseCaipAssetType(quote.src.asset.assetId).chainId;
  const nativeAsset = create(
    getNativeAssetForChainId(srcChainId),
    BridgeAssetV2FromV1,
  );

  return {
    ...restOfQuoteResponse,
    quote: {
      ...quote,
      dest: {
        ...quote.dest,
        normalizedAmount: expectedQuoteMetadata.toTokenAmount?.amount,
        usd: expectedQuoteMetadata.toTokenAmount?.usd,
        valueInCurrency: expectedQuoteMetadata.toTokenAmount?.valueInCurrency,
        min: {
          ...quote.dest.min,
          normalizedAmount: expectedQuoteMetadata.minToTokenAmount?.amount,
          usd: expectedQuoteMetadata.minToTokenAmount?.usd,
          valueInCurrency:
            expectedQuoteMetadata.minToTokenAmount?.valueInCurrency,
        },
      },
      src: {
        ...quote.src,
        ...(expectedQuoteMetadata.sentAmount
          ? {
              usd: expectedQuoteMetadata.sentAmount?.usd,
              valueInCurrency:
                expectedQuoteMetadata.sentAmount?.valueInCurrency,
              normalizedAmount: expectedQuoteMetadata.sentAmount?.amount,
              amount: calcTokenValue(
                expectedQuoteMetadata.sentAmount?.amount ?? '0',
                quote.src.asset.decimals,
              ),
            }
          : {}),
      },
      feeData: {
        metabridge: [quote.feeData.metabridge[0]],
        network: [
          {
            ...(quote.feeData.network?.[0] ?? {}),
            normalizedAmount: expectedQuoteMetadata.totalNetworkFee?.amount,
            amount: calcTokenValue(
              expectedQuoteMetadata.totalNetworkFee?.amount ?? '0',
              nativeAsset.decimals,
            ),
            usd: expectedQuoteMetadata.totalNetworkFee?.usd,
            valueInCurrency:
              expectedQuoteMetadata.totalNetworkFee?.valueInCurrency,
            asset: nativeAsset,
          },
        ],
        ...(expectedQuoteMetadata.includedTxFees?.amount &&
        quote.feeData.txFee?.[0]
          ? {
              txFee: [
                {
                  ...(quote.feeData.txFee?.[0] ?? {}),
                  normalizedAmount: expectedQuoteMetadata.includedTxFees.amount,
                  usd: expectedQuoteMetadata.includedTxFees?.usd,
                  valueInCurrency:
                    expectedQuoteMetadata.includedTxFees?.valueInCurrency,
                },
              ],
            }
          : {}),
      },
      priceData: {
        ...quote.priceData,
        swapRate: expectedQuoteMetadata.swapRate,
        ...(expectedQuoteMetadata.adjustedReturn
          ? {
              adjustedReturn: {
                usd: expectedQuoteMetadata.adjustedReturn.usd,
                valueInCurrency:
                  expectedQuoteMetadata.adjustedReturn.valueInCurrency,
              },
            }
          : {}),
        cost: {
          usd: expectedQuoteMetadata.cost?.usd,
          valueInCurrency: expectedQuoteMetadata.cost?.valueInCurrency,
        },
      },
    },
  };
};

export type DeepPartial<Type> = Type extends string
  ? Type
  : {
      [K in keyof Type]?: Type[K] extends (infer U)[]
        ? DeepPartial<U>[]
        : Type[K] extends readonly (infer U)[]
          ? readonly DeepPartial<U>[]
          : Type[K] extends object
            ? DeepPartial<Type[K]>
            : Type[K];
    };
