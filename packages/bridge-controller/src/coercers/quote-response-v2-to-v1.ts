import {
  create,
  coerce,
  is,
  StructError,
  intersection,
  Infer,
} from '@metamask/superstruct';
import { parseCaipAssetType } from '@metamask/utils';

import type { Step } from '../types';
import {
  formatAddressToCaipReference,
  formatChainIdToDec,
} from '../utils/caip-formatters';
import type { QuoteMetadata } from '../utils/quote-metadata/types';
import { formatStructErrors } from '../utils/struct-error';
import {
  BridgeAssetSchema,
  BridgeAssetV2Schema,
  MinimalAssetSchema,
} from '../validators/bridge-asset';
import {
  QuoteSchemaV2,
  FeeType,
  Quote,
  QuoteSchema,
} from '../validators/quote';
import { QuoteResponseSchemaV2 } from '../validators/quote-response';
import type { QuoteResponse } from '../validators/quote-response';
import { QuoteResponseSchemaV1 } from '../validators/quote-response-v1';
import type { QuoteResponseV1 } from '../validators/quote-response-v1';
import { StepSchemaV2, StepSchema } from '../validators/step';

const BridgeAssetV1FromV2 = coerce(
  intersection([BridgeAssetSchema, MinimalAssetSchema]),
  BridgeAssetV2Schema,
  (value) => {
    const { assetId, ...rest } = value;

    const { chainId } = parseCaipAssetType(assetId);
    return {
      address: formatAddressToCaipReference(assetId),
      chainId: formatChainIdToDec(chainId),
      assetId,
      ...rest,
    };
  },
);

const toBridgeAssetV1 = (data: unknown): Infer<typeof BridgeAssetSchema> => {
  return create(data, BridgeAssetV1FromV2);
};

const StepSchemaV1FromV2 = coerce(StepSchema, StepSchemaV2, (value) => {
  const { src, dest, action } = value;
  const srcAsset = toBridgeAssetV1(src.asset);
  const destAsset = toBridgeAssetV1(dest.asset);

  return {
    action,
    srcChainId: srcAsset.chainId,
    destChainId: destAsset.chainId,
    srcAsset,
    destAsset,
  };
});

const toStepV1 = (step: unknown): Step => {
  const stepV2 = create(step, StepSchemaV1FromV2);
  return stepV2;
};

const QuoteV1FromV2 = coerce(QuoteSchema, QuoteSchemaV2, (value) => {
  const {
    priceData,
    feeData,
    steps,
    protocols,
    aggregator,
    src,
    dest,
    ...restQuote
  } = value;

  const { chainId: srcChainIdInCaip, assetReference: srcReference } =
    parseCaipAssetType(src.asset.assetId);
  const { chainId: destChainIdInCaip, assetReference: destReference } =
    parseCaipAssetType(dest.asset.assetId);

  const srcChainId = formatChainIdToDec(srcChainIdInCaip);
  const destChainId = formatChainIdToDec(destChainIdInCaip);
  const srcTokenAddress = formatAddressToCaipReference(srcReference);
  const destTokenAddress = formatAddressToCaipReference(destReference);

  const { usd, ...metabridgeFeeData } = feeData[FeeType.METABRIDGE][0];

  return {
    bridges: protocols,
    bridgeId: aggregator,
    protocols,
    aggregator,
    srcChainId,
    destChainId,
    srcAsset: {
      ...src.asset,
      chainId: srcChainId,
      address: srcTokenAddress,
    },
    destAsset: {
      ...dest.asset,
      chainId: destChainId,
      address: destTokenAddress,
    },
    srcTokenAmount: src.amount,
    destTokenAmount: dest.amount,
    minDestTokenAmount: dest.minAmount,
    ...(dest.walletAddress && { destWalletAddress: dest.walletAddress }),
    feeData: {
      [FeeType.METABRIDGE]: {
        ...metabridgeFeeData,
        asset: {
          ...metabridgeFeeData.asset,
          chainId: formatChainIdToDec(
            parseCaipAssetType(metabridgeFeeData.asset.assetId).chainId,
          ),
          address: formatAddressToCaipReference(
            parseCaipAssetType(metabridgeFeeData.asset.assetId).assetReference,
          ),
        },
      },
      ...(feeData[FeeType.TX_FEE]?.length && {
        ...feeData[FeeType.TX_FEE][0],
        asset: feeData[FeeType.TX_FEE][0].asset,
      }),
    },
    ...(src.walletAddress && { walletAddress: src.walletAddress }),
    ...(value.priceData?.priceImpact?.amount && {
      priceData: {
        priceImpact: value.priceData?.priceImpact?.amount,
      },
    }),
    /**
     * @deprecated This field is deprecated.
     */
    steps: steps?.map(toStepV1),
    ...restQuote,
  };
});

const toQuoteV1 = (quote: unknown): Quote => {
  const quoteV2 = create(quote, QuoteV1FromV2);
  return quoteV2;
};

const QuoteResponseV1FromV2 = coerce(
  QuoteResponseSchemaV1,
  QuoteResponseSchemaV2,
  (value: QuoteResponse | null) => {
    if (!value) {
      return null;
    }
    const {
      quote,
      estimatedProcessingTimeInSeconds,
      approval,
      // @ts-expect-error - Some networks don't have an approval field
      resetApproval,
      featureId,
      trade,
      quoteRequestIndex,
      nonEvmFeesInNative,
      l1GasFeesInHexWei,
      quoteId,
      namespace,
      chainId,
    } = value;

    const quoteV1 = toQuoteV1(quote);
    return {
      estimatedProcessingTimeInSeconds,
      approval,
      trade,
      quote: quoteV1,
      ...(featureId && { featureId }),
      ...(quoteId && { quoteId }),
      ...(resetApproval && { resetApproval }),
      ...(quoteRequestIndex !== undefined && { quoteRequestIndex }),
      ...(nonEvmFeesInNative && { nonEvmFeesInNative }),
      ...(l1GasFeesInHexWei && { l1GasFeesInHexWei }),
    };
  },
);

/**
 * Converts a {@link QuoteResponse} to a {@link QuoteResponseV1} for backwards compatibility.
 * This does not preserve any post-fetch {@link QuoteMetadata}.
 *
 * @deprecated Avoid introducing new code that uses this function. It is only for backwards compatibility with the old quote response format.
 * @param quoteResponse - The {@link QuoteResponse} to convert
 * @returns The {@link QuoteResponseV1}
 */
export const toQuoteResponseV1 = (
  quoteResponse:
    | QuoteResponse
    | (QuoteResponseV1 & QuoteMetadata)
    | QuoteResponseV1,
): QuoteResponseV1 & QuoteMetadata => {
  let errorMessage = 'Failed to convert';

  // V1 quote
  if (is(quoteResponse, QuoteResponseSchemaV1)) {
    errorMessage += ' unmodified QuoteResponseV1';
    return quoteResponse as QuoteResponseV1 & QuoteMetadata;
  }

  try {
    // V2 with namespace, chainId, maybe QuoteMetadata
    if (is(quoteResponse, QuoteResponseSchemaV2)) {
      errorMessage += ' QuoteResponseV2 + metadata to QuoteResponseV1';
      const quoteResponseV1 = create(quoteResponse, QuoteResponseV1FromV2);
      return quoteResponseV1;
    }

    // V2 with no namespace, chainId
    errorMessage += ' QuoteResponseV2 to QuoteResponseV1';
    return create(quoteResponse, QuoteResponseV1FromV2);
  } catch (error) {
    let errorDetails = error instanceof Error ? error.message : 'Unknown error';

    if (error instanceof StructError) {
      const formattedErrors = formatStructErrors(error);
      errorDetails = JSON.stringify(formattedErrors, null, 2);
      console.warn(errorMessage, formatStructErrors(error));
    }

    throw new Error(`${errorMessage}. ${errorDetails}`);
  }
};
