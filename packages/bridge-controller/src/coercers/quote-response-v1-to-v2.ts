import { create, coerce, Infer, is, intersection } from '@metamask/superstruct';
import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { formatAddressToAssetId } from '../utils/caip-formatters';
import {
  BridgeAssetSchema,
  BridgeAssetV2Schema,
  MinimalAssetSchema,
} from '../validators/bridge-asset';
import { QuoteSchemaV2, FeeType, QuoteSchema } from '../validators/quote';
import {
  QuoteResponseSchemaV2,
  validateQuoteResponse,
} from '../validators/quote-response';
import type { QuoteResponse } from '../validators/quote-response';
import { QuoteResponseSchemaV1 } from '../validators/quote-response-v1';
import type { QuoteResponseV1 } from '../validators/quote-response-v1';
import { StepSchemaV2, StepSchema } from '../validators/step';

const BridgeAssetV2FromV1 = coerce(
  BridgeAssetV2Schema,
  intersection([BridgeAssetSchema, MinimalAssetSchema]),
  (value) => {
    const {
      chainId,
      address,
      // @ts-expect-error - chainAgnosticId is not in the schema
      chainAgnosticId,
      // @ts-expect-error - logoURI is not in the schema
      logoURI,
      iconUrl,
      icon,
      assetId,
      ...rest
    } = value;

    const resolvedIconUrl = iconUrl ?? logoURI ?? icon;

    return {
      assetId: assetId ?? formatAddressToAssetId(address, chainId),
      ...(resolvedIconUrl && { iconUrl: resolvedIconUrl }),
      ...rest,
    };
  },
);

export const toBridgeAssetV2 = (
  data: unknown,
): Infer<typeof BridgeAssetV2Schema> => {
  return create(data, BridgeAssetV2FromV1);
};

const StepSchemaV2FromV1 = coerce(StepSchemaV2, StepSchema, (value) => {
  const { srcAsset, destAsset, action } = value;
  return {
    action,
    src: {
      asset: toBridgeAssetV2(srcAsset),
    },
    dest: {
      asset: toBridgeAssetV2(destAsset),
    },
  };
});
const toStepV2 = (step: unknown): Infer<typeof StepSchemaV2> =>
  create(step, StepSchemaV2FromV1);

const QuoteV2FromV1 = coerce(QuoteSchemaV2, QuoteSchema, (value) => {
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
    intent,
    ...restQuote
  } = value;

  return {
    src: {
      amount: new BigNumber(srcTokenAmount)
        .plus(intent ? 0 : feeData[FeeType.METABRIDGE].amount)
        .toFixed(),
      asset: toBridgeAssetV2(srcAsset),
      ...(walletAddress && { walletAddress }),
    },
    dest: {
      amount: destTokenAmount,
      asset: toBridgeAssetV2(destAsset),
      ...(destWalletAddress && { walletAddress: destWalletAddress }),
      minAmount: minDestTokenAmount,
    },
    priceData: {
      ...(value.priceData?.priceImpact && {
        priceImpact: {
          amount: value.priceData?.priceImpact,
        },
      }),
    },
    feeData: {
      [FeeType.METABRIDGE]: [
        {
          ...feeData[FeeType.METABRIDGE],
          asset: toBridgeAssetV2(feeData[FeeType.METABRIDGE].asset),
          ...(priceData?.totalFeeAmountUsd && {
            usd: priceData?.totalFeeAmountUsd,
          }),
        },
      ],
      ...(feeData[FeeType.TX_FEE] && {
        [FeeType.TX_FEE]: [
          {
            ...feeData[FeeType.TX_FEE],
            asset: toBridgeAssetV2(feeData[FeeType.TX_FEE].asset),
          },
        ],
      }),
    },
    steps: steps ? steps.map(toStepV2) : undefined,
    ...restQuote,
    protocols: bridges,
    aggregator: bridgeId,
  };
});

const toQuoteV2 = (quote: unknown): Infer<typeof QuoteSchemaV2> => {
  const quoteV2 = create(quote, QuoteV2FromV1);
  return quoteV2;
};

const QuoteResponseV2FromV1 = coerce(
  QuoteResponseSchemaV2,
  QuoteResponseSchemaV1,
  (value: QuoteResponseV1) => {
    const { quote, l1GasFeesInHexWei, nonEvmFeesInNative, ...rest } = value;
    const { srcAsset } = quote;

    const {
      chain: { namespace },
      chainId,
    } = parseCaipAssetType(srcAsset.assetId);

    return {
      ...rest,
      ...(nonEvmFeesInNative && { nonEvmFeesInNative }),
      ...(l1GasFeesInHexWei && { l1GasFeesInHexWei }),
      namespace,
      chainId,
      quote: toQuoteV2(quote),
    };
  },
);

/**
 * Converts a partial quote response to a {@link QuoteResponse}.
 * This does not preserve any post-fetch metadata.
 *
 * @param quoteResponse - The {@link QuoteResponseV1} to convert
 * @returns The {@link QuoteResponse}
 */
export function toQuoteResponseV2(quoteResponse: unknown): QuoteResponse {
  let quoteResponseV2: QuoteResponse | null = null;

  // V1 quote
  if (quoteResponse && is(quoteResponse, QuoteResponseSchemaV1)) {
    quoteResponseV2 = create(quoteResponse, QuoteResponseV2FromV1);
    if (!quoteResponseV2) {
      throw new Error('QuoteResponseV1 to V2 conversion failed');
    }
  }

  // V2 quote
  else if (validateQuoteResponse(quoteResponse)) {
    quoteResponseV2 = quoteResponse;
  }

  if (quoteResponseV2) {
    const {
      chain: { namespace },
      chainId,
    } = parseCaipAssetType(quoteResponseV2.quote.src.asset.assetId);

    // Add namespace, chainId
    return { ...quoteResponseV2, namespace: namespace as never, chainId };
  }

  throw new Error(
    'QuoteResponseV1 to V2 conversion failed. Invalid quoteResponse provided',
  );
}
