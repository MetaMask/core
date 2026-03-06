import type { TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import { sumAmounts } from './amounts';
import { calculateTransactionGasCost } from './gas';
import type {
  FiatValue,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayRequiredToken,
  TransactionPayTotals,
} from '../types';

/**
 * Calculate totals for a list of quotes and tokens.
 *
 * @param request - Request parameters.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.quotes - List of bridge quotes.
 * @param request.messenger - Controller messenger.
 * @param request.tokens - List of required tokens.
 * @param request.transaction - Transaction metadata.
 * @returns The calculated totals in USD and fiat currency.
 */
export function calculateTotals({
  isMaxAmount,
  quotes,
  messenger,
  tokens,
  transaction,
}: {
  isMaxAmount?: boolean;
  quotes: TransactionPayQuote<unknown>[];
  messenger: TransactionPayControllerMessenger;
  tokens: TransactionPayRequiredToken[];
  transaction: TransactionMeta;
}): TransactionPayTotals {
  const metaMaskFee = sumFiat(quotes.map((quote) => quote.fees.metaMask));
  const providerFee = sumFiat(quotes.map((quote) => quote.fees.provider));

  const sourceNetworkFeeMax = sumAmounts(
    quotes.map((quote) => quote.fees.sourceNetwork.max),
  );

  const sourceNetworkFeeEstimate = sumAmounts(
    quotes.map((quote) => quote.fees.sourceNetwork.estimate),
  );

  const transactionNetworkFee = calculateTransactionGasCost(
    transaction,
    messenger,
  );

  const targetNetworkFee = quotes?.length
    ? {
        ...sumFiat(quotes.map((quote) => quote.fees.targetNetwork)),
        isGasFeeToken: false,
      }
    : transactionNetworkFee;

  const sourceAmount = sumAmounts(quotes.map((quote) => quote.sourceAmount));
  const targetAmount = sumFiat(quotes.map((quote) => quote.targetAmount));

  const quoteTokens = tokens.filter(
    (singleToken) => !singleToken.skipIfBalance,
  );

  const amountFiat = sumProperty(quoteTokens, (token) => token.amountFiat);
  const amountUsd = sumProperty(quoteTokens, (token) => token.amountUsd);
  const hasQuotes = quotes.length > 0;

  const totalFiat = new BigNumber(providerFee.fiat)
    .plus(metaMaskFee.fiat)
    .plus(sourceNetworkFeeEstimate.fiat)
    .plus(targetNetworkFee.fiat)
    .plus(isMaxAmount && hasQuotes ? targetAmount.fiat : amountFiat)
    .toString(10);

  const totalUsd = new BigNumber(providerFee.usd)
    .plus(metaMaskFee.usd)
    .plus(sourceNetworkFeeEstimate.usd)
    .plus(targetNetworkFee.usd)
    .plus(isMaxAmount && hasQuotes ? targetAmount.usd : amountUsd)
    .toString(10);

  const estimatedDuration = Number(
    sumProperty(quotes, (quote) => quote.estimatedDuration),
  );

  const isSourceGasFeeToken = quotes.some(
    (quote) => quote.fees.isSourceGasFeeToken,
  );

  const isTargetGasFeeToken =
    Boolean(targetNetworkFee.isGasFeeToken) ||
    quotes.some((quote) => quote.fees.isTargetGasFeeToken);

  return {
    estimatedDuration,
    fees: {
      isSourceGasFeeToken,
      isTargetGasFeeToken,
      metaMask: metaMaskFee,
      provider: providerFee,
      sourceNetwork: {
        estimate: sourceNetworkFeeEstimate,
        max: sourceNetworkFeeMax,
      },
      targetNetwork: targetNetworkFee,
    },
    sourceAmount,
    targetAmount,
    total: {
      fiat: totalFiat,
      usd: totalUsd,
    },
  };
}

/**
 * Sum a list of fiat value.
 *
 * @param data - List of fiat values.
 * @returns Total fiat value.
 */
function sumFiat(data: FiatValue[]): FiatValue {
  const fiat = sumProperty(data, (item) => item.fiat);
  const usd = sumProperty(data, (item) => item.usd);
  return { fiat, usd };
}

/**
 * Sum a specific property from a list of items.
 *
 * @param data - List of items.
 * @param getProperty - Function to extract the property to sum from each item.
 * @returns The summed value as a string.
 */
function sumProperty<DataType>(
  data: DataType[],
  getProperty: (item: DataType) => BigNumber.Value,
): string {
  return data
    .map(getProperty)
    .reduce<BigNumber>((total, value) => total.plus(value), new BigNumber(0))
    .toString(10);
}
