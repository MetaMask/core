import { BigNumber } from 'bignumber.js';

import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayTotals,
  TransactionToken,
} from '../types';

/**
 * Calculate totals for a list of quotes and tokens.
 *
 * @param quotes - List of bridge quotes.
 * @param tokens - List of required transaction tokens.
 * @param messenger - Controller messenger.
 * @returns The calculated totals in USD and fiat currency.
 */
export function calculateTotals(
  quotes: TransactionPayQuote<unknown>[],
  tokens: TransactionToken[],
  messenger: TransactionPayControllerMessenger,
): TransactionPayTotals {
  const providerFeeFiat = sumProperty(
    quotes,
    (quote) => quote.fees.provider.fiat,
  );

  const providerFeeUsd = sumProperty(
    quotes,
    (quote) => quote.fees.provider.usd,
  );

  const sourceNetworkFeeFiat = sumProperty(
    quotes,
    (quote) => quote.fees.sourceNetwork.fiat,
  );

  const sourceNetworkFeeUsd = sumProperty(
    quotes,
    (quote) => quote.fees.sourceNetwork.usd,
  );

  const targetNetworkFeeFiat = sumProperty(
    quotes,
    (quote) => quote.fees.targetNetwork.fiat,
  );

  const targetNetworkFeeUsd = sumProperty(
    quotes,
    (quote) => quote.fees.targetNetwork.usd,
  );

  const totalFiat = new BigNumber(providerFeeFiat)
    .plus(sourceNetworkFeeFiat)
    .plus(targetNetworkFeeFiat)
    .toString(10);

  const totalUsd = new BigNumber(providerFeeUsd)
    .plus(sourceNetworkFeeUsd)
    .plus(targetNetworkFeeUsd)
    .toString(10);

  const estimatedDuration = Number(
    sumProperty(quotes, (quote) => quote.estimatedDuration),
  );

  return {
    estimatedDuration,
    fees: {
      provider: {
        fiat: providerFeeFiat,
        usd: providerFeeUsd,
      },
      sourceNetwork: {
        fiat: sourceNetworkFeeFiat,
        usd: sourceNetworkFeeUsd,
      },
      targetNetwork: {
        fiat: targetNetworkFeeFiat,
        usd: targetNetworkFeeUsd,
      },
    },
    total: {
      fiat: totalFiat,
      usd: totalUsd,
    },
  };
}

/**
 * Sum a specific property from a list of quotes.
 *
 * @param quotes - List of bridge quotes.
 * @param getProperty - Function to extract the property to sum from each quote.
 * @returns The summed value as a string.
 */
function sumProperty(
  quotes: TransactionPayQuote<unknown>[],
  getProperty: (quote: TransactionPayQuote<unknown>) => BigNumber.Value,
): string {
  return quotes
    .map(getProperty)
    .reduce<BigNumber>((total, value) => total.plus(value), new BigNumber(0))
    .toString(10);
}
