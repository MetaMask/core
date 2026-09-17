import type { DeepPartial } from '../../types.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { FeeType } from '../../validators/quote.js';
import { calcNormalizedTokenAmount } from '../number-formatters.js';

/**
 * Builds a partial {@link QuoteResponese} with normalized amounts
 *
 * @param quoteResponseV2 - The {@link QuoteResponse} to convert
 * @returns The {@link DeepPartial<QuoteResponse>}
 */
export const toNormalizedAmounts = (
  quoteResponseV2: DeepPartial<QuoteResponse>,
): DeepPartial<QuoteResponse> => {
  const { src, dest, feeData } = quoteResponseV2.quote ?? {};

  return {
    quote: {
      src: {
        normalizedAmount: calcNormalizedTokenAmount(
          src?.amount,
          src?.asset?.decimals,
        ),
      },
      dest: {
        normalizedAmount: calcNormalizedTokenAmount(
          dest?.amount,
          dest?.asset?.decimals,
        ),
        minAmountNormalized: calcNormalizedTokenAmount(
          dest?.minAmount,
          dest?.asset?.decimals,
        ),
      },
      feeData: {
        network: feeData?.[FeeType.NETWORK]?.map((networkFee) => ({
          normalizedAmount: calcNormalizedTokenAmount(
            networkFee?.amount,
            networkFee?.asset?.decimals,
          ),
        })),
        ...(feeData?.reserve && {
          reserve: feeData.reserve.map((reserve) => ({
            normalizedAmount: calcNormalizedTokenAmount(
              reserve?.amount,
              reserve?.asset?.decimals,
            )?.toFixed(),
          })),
        }),
        relayer: feeData?.[FeeType.RELAYER]?.map((relayerFee) => ({
          normalizedAmount: calcNormalizedTokenAmount(
            relayerFee.amount,
            relayerFee.asset?.decimals,
          ),
        })),
        txFee: feeData?.[FeeType.TX_FEE]?.map((txFee) => ({
          normalizedAmount: calcNormalizedTokenAmount(
            txFee.amount,
            txFee.asset?.decimals,
          ),
        })),
      },
    },
  };
};
