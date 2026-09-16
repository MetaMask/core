import type { CaipAssetType } from '@metamask/utils';

import type { DeepPartial } from '../../types.js';
import type { AmountsAndAsset } from '../../validators/amount-and-asset.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { isNativeAddress } from '../bridge.js';
import { sumAmountsByAssetId } from '../number-formatters.js';
import { balanceGte } from './utils.js';

/**
 * Checks if the balance of the wallet is greater than or equal to the total fees
 *
 * @param options - The options for the function
 * @param options.balances - The normalized balances of the wallet, indexed by assetId
 * @param options.quote - The quote to validate
 * @param options.minimumBalance - The minimum balance required in the wallet after the quote is executed
 * @param options.ignoreGasLessFlags - If true, perform balance check regardless of the gasless flags (i.e for metrics)
 * @returns true if the balance is greater than or equal to the total fees OR if the quote has no network fee, false otherwise
 */
export const hasSufficientGasForQuote = ({
  balances,
  quote,
  minimumBalance,
  ignoreGasLessFlags = false,
}: {
  balances: Record<
    CaipAssetType,
    AmountsAndAsset['normalizedAmount'] | undefined
  >;
  quote: DeepPartial<QuoteResponse['quote']>;
  minimumBalance?: AmountsAndAsset;
  ignoreGasLessFlags?: boolean;
}): boolean => {
  const { feeData, src, gasIncluded, gasIncluded7702, gasSponsored } = quote;

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const isGasless = Boolean(gasIncluded || gasSponsored || gasIncluded7702);
  // Return early if quote is gasless
  if (isGasless && !ignoreGasLessFlags) {
    return true;
  }

  const totalFees = sumAmountsByAssetId(
    feeData?.network,
    feeData?.relayer,
    // Include src amount in balance check if src asset is native
    isNativeAddress(src?.asset?.assetId) ? [src] : undefined,
    minimumBalance ? [minimumBalance] : undefined,
  );

  // Compare total fees to the balance of the wallet
  return balanceGte(balances, totalFees);
};
