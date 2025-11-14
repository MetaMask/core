import type { TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import { calculateTransactionGasCost } from './gas';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayRequiredToken,
  TransactionPayTotals,
} from '../types';

/**
 * Calculate totals for a list of quotes and tokens.
 *
 * @param request - Request parameters.
 * @param request.quotes - List of bridge quotes.
 * @param request.messenger - Controller messenger.
 * @param request.tokens - List of required tokens.
 * @param request.transaction - Transaction metadata.
 * @returns The calculated totals in USD and fiat currency.
 */
export function calculateTotals({
  quotes,
  messenger,
  tokens,
  transaction,
}: {
  quotes: TransactionPayQuote<unknown>[];
  messenger: TransactionPayControllerMessenger;
  tokens: TransactionPayRequiredToken[];
  transaction: TransactionMeta;
}): TransactionPayTotals {
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

  const transactionNetworkFee = calculateTransactionGasCost(
    transaction,
    messenger,
  );

  const targetNetworkFeeFiat = quotes?.length
    ? sumProperty(quotes, (quote) => quote.fees.targetNetwork.fiat)
    : transactionNetworkFee.fiat;

  const targetNetworkFeeUsd = quotes.length
    ? sumProperty(quotes, (quote) => quote.fees.targetNetwork.usd)
    : transactionNetworkFee.usd;

  const quoteTokens = tokens.filter((t) => !t.skipIfBalance);
  const amountFiat = sumProperty(quoteTokens, (token) => token.amountFiat);
  const amountUsd = sumProperty(quoteTokens, (token) => token.amountUsd);

  const totalFiat = new BigNumber(providerFeeFiat)
    .plus(sourceNetworkFeeFiat)
    .plus(targetNetworkFeeFiat)
    .plus(amountFiat)
    .toString(10);

  const totalUsd = new BigNumber(providerFeeUsd)
    .plus(sourceNetworkFeeUsd)
    .plus(targetNetworkFeeUsd)
    .plus(amountUsd)
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
 * Sum a specific property from a list of items.
 *
 * @param data - List of items.
 * @param getProperty - Function to extract the property to sum from each item.
 * @returns The summed value as a string.
 */
function sumProperty<T>(
  data: T[],
  getProperty: (item: T) => BigNumber.Value,
): string {
  return data
    .map(getProperty)
    .reduce<BigNumber>((total, value) => total.plus(value), new BigNumber(0))
    .toString(10);
}
