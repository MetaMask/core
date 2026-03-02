import type { TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import { calculateTransactionGasCost } from './gas';
import { TransactionPayStrategy } from '../constants';
import type {
  Amount,
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
 * @param request.fiatPaymentAmountUsd - Entered fiat payment amount in USD.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.quotes - List of bridge quotes.
 * @param request.messenger - Controller messenger.
 * @param request.tokens - List of required tokens.
 * @param request.transaction - Transaction metadata.
 * @returns The calculated totals in USD and fiat currency.
 */
export function calculateTotals({
  fiatPaymentAmountUsd,
  isMaxAmount,
  quotes,
  messenger,
  tokens,
  transaction,
}: {
  fiatPaymentAmountUsd?: string | null;
  isMaxAmount?: boolean;
  quotes: TransactionPayQuote<unknown>[];
  messenger: TransactionPayControllerMessenger;
  tokens: TransactionPayRequiredToken[];
  transaction: TransactionMeta;
}): TransactionPayTotals {
  const metaMaskFee = sumFiat(quotes.map((quote) => quote.fees.metaMask));
  const providerFee = sumFiat(quotes.map((quote) => quote.fees.provider));
  const fiatProviderFee = sumFiat(
    quotes.map((quote) => quote.fees.fiatProvider ?? { fiat: '0', usd: '0' }),
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
  const hasFiatQuote = quotes.some(
    (quote) => quote.strategy === TransactionPayStrategy.Fiat,
  );
  const defaultTotalAmountUsd =
    isMaxAmount && hasQuotes ? targetAmount.usd : amountUsd;

  const totalAmountUsd = hasFiatQuote
    ? new BigNumber(fiatPaymentAmountUsd ?? 0).toString(10)
    : defaultTotalAmountUsd;
  const totalFiat = hasFiatQuote
    ? new BigNumber(fiatPaymentAmountUsd ?? 0)
        .plus(fiatProviderFee.fiat)
        .toString(10)
    : new BigNumber(providerFee.fiat)
        .plus(fiatProviderFee.fiat)
        .plus(metaMaskFee.fiat)
        .plus(sourceNetworkFeeEstimate.fiat)
        .plus(targetNetworkFee.fiat)
        .plus(isMaxAmount && hasQuotes ? targetAmount.fiat : amountFiat)
        .toString(10);

  const totalUsd = hasFiatQuote
    ? new BigNumber(totalAmountUsd).plus(fiatProviderFee.usd).toString(10)
    : new BigNumber(providerFee.usd)
        .plus(fiatProviderFee.usd)
        .plus(metaMaskFee.usd)
        .plus(sourceNetworkFeeEstimate.usd)
        .plus(targetNetworkFee.usd)
        .plus(totalAmountUsd)
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
      fiatProvider: fiatProviderFee,
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
 * Sum a list of amounts.
 *
 * @param data - List of amounts.
 * @returns Total amount.
 */
function sumAmounts(data: Amount[]): Amount {
  const fiatValue = sumFiat(data);
  const human = sumProperty(data, (item) => item.human);
  const raw = sumProperty(data, (item) => item.raw);

  return {
    ...fiatValue,
    human,
    raw,
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
