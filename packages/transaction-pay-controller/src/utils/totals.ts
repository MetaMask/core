import type { TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../constants';
import type {
  FiatValue,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayRequiredToken,
  TransactionPayTotals,
} from '../types';
import { sumAmounts } from './amounts';
import { calculateTransactionGasCost } from './gas';

/**
 * Calculate totals for a list of quotes and tokens.
 *
 * @param request - Request parameters.
 * @param request.fiatPaymentAmount - The amount of the transaction in fiat.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.quotes - List of bridge quotes.
 * @param request.messenger - Controller messenger.
 * @param request.tokens - List of required tokens.
 * @param request.transaction - Transaction metadata.
 * @returns The calculated totals in USD and fiat currency.
 */
export function calculateTotals({
  fiatPaymentAmount,
  isMaxAmount,
  quotes,
  messenger,
  tokens,
  transaction,
}: {
  fiatPaymentAmount?: string;
  isMaxAmount?: boolean;
  quotes: TransactionPayQuote<unknown>[];
  messenger: TransactionPayControllerMessenger;
  tokens: TransactionPayRequiredToken[];
  transaction: TransactionMeta;
}): TransactionPayTotals {
  const metaMaskFee = sumFiat(quotes.map((quote) => quote.fees.metaMask));
  const providerFee = sumFiat(quotes.map((quote) => quote.fees.provider));
  const providerFiatFee = sumFiat(
    quotes.map((quote) => quote.fees.providerFiat ?? { fiat: '0', usd: '0' }),
  );
  const hasFiatStrategy = quotes.some(
    (quote) => quote.strategy === TransactionPayStrategy.Fiat,
  );

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

  const sourceAmountFiat = getSourceAmount({
    hasFiatStrategy,
    fiatPaymentAmount,
    isMaxAmount,
    hasQuotes,
    targetAmount: targetAmount.fiat,
    tokenAmount: amountFiat,
  });

  const sourceAmountUsd = getSourceAmount({
    hasFiatStrategy,
    fiatPaymentAmount,
    isMaxAmount,
    hasQuotes,
    targetAmount: targetAmount.usd,
    tokenAmount: amountUsd,
  });

  const totalFiat = new BigNumber(providerFee.fiat)
    .plus(metaMaskFee.fiat)
    .plus(sourceNetworkFeeEstimate.fiat)
    .plus(targetNetworkFee.fiat)
    .plus(sourceAmountFiat)
    .toString(10);

  const totalUsd = new BigNumber(providerFee.usd)
    .plus(metaMaskFee.usd)
    .plus(sourceNetworkFeeEstimate.usd)
    .plus(targetNetworkFee.usd)
    .plus(sourceAmountUsd)
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
      providerFiat: providerFiatFee,
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
 * Get the source amount to include in totals.
 *
 * @param request - Request parameters.
 * @param request.hasFiatStrategy - Whether a fiat strategy quote is present.
 * @param request.fiatPaymentAmount - The fiat payment amount, if applicable.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.hasQuotes - Whether any quotes are present.
 * @param request.targetAmount - The target amount from quotes.
 * @param request.tokenAmount - The summed token amount.
 * @returns The payment amount to include in totals.
 */
function getSourceAmount({
  hasFiatStrategy,
  fiatPaymentAmount,
  isMaxAmount,
  hasQuotes,
  targetAmount,
  tokenAmount,
}: {
  hasFiatStrategy: boolean;
  fiatPaymentAmount?: string;
  isMaxAmount?: boolean;
  hasQuotes: boolean;
  targetAmount: string;
  tokenAmount: string;
}): string {
  if (hasFiatStrategy) {
    return fiatPaymentAmount ?? '0';
  }

  if (isMaxAmount && hasQuotes) {
    return targetAmount;
  }

  return tokenAmount;
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
