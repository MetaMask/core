import { BigNumber } from 'bignumber.js';

import type { DeepPartial } from '../../types.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { sumAmounts } from '../number-formatters.js';

/**
 * Checks if the network fee is defined and greater than 0
 *
 * @param quote - The quote to validate
 * @returns true if quote is gasless or the network fee is defined and greater than 0, false otherwise
 */
export const hasNetworkFee = (
  quote: DeepPartial<QuoteResponse['quote']>,
): boolean => {
  const { gasIncluded, gasSponsored, gasIncluded7702 } = quote;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const isGasless = Boolean(gasIncluded || gasSponsored || gasIncluded7702);

  if (isGasless) {
    return true;
  }

  const totalNetworkFee = sumAmounts(
    quote.feeData?.network,
    quote.feeData?.relayer,
  );

  const totalNetworkFeeAmount = [
    totalNetworkFee?.valueInCurrency,
    totalNetworkFee?.normalizedAmount,
    totalNetworkFee?.amount,
  ].find((amount) => amount && amount !== '0');

  return Boolean(
    totalNetworkFeeAmount && new BigNumber(totalNetworkFeeAmount).gt(0),
  );
};
