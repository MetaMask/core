import type { DeepPartial } from '../../types';
import { FeeType } from '../../validators/quote';
import { QuoteResponse } from '../../validators/quote-response';
import { calcTokenAmount } from '../number-formatters';

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
        normalizedAmount: calcTokenAmount(
          src?.amount,
          src?.asset?.decimals,
        )?.toFixed(),
      },
      dest: {
        normalizedAmount: calcTokenAmount(
          dest?.amount,
          dest?.asset?.decimals,
        )?.toFixed(),
        minAmountNormalized: calcTokenAmount(
          dest?.minAmount,
          dest?.asset?.decimals,
        )?.toFixed(),
      },
      feeData: {
        network: feeData?.[FeeType.NETWORK]?.map((networkFee) => ({
          normalizedAmount: calcTokenAmount(
            networkFee?.amount,
            networkFee?.asset?.decimals,
          )?.toFixed(),
        })),
        relayer: feeData?.[FeeType.RELAYER]?.map((relayerFee) => ({
          normalizedAmount: calcTokenAmount(
            relayerFee.amount,
            relayerFee.asset?.decimals,
          )?.toFixed(),
        })),
        txFee: feeData?.[FeeType.TX_FEE]?.map((txFee) => ({
          normalizedAmount: calcTokenAmount(
            txFee.amount,
            txFee.asset?.decimals,
          )?.toFixed(),
        })),
      },
    },
  };
};
