import type { QuotesResponse, Quote } from '@metamask/ramps-controller';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';

const log = createModuleLogger(projectLogger, 'fiat-strategy');

/**
 * Fetch Fiat quotes.
 *
 * @param request - Strategy quotes request.
 * @returns Empty quotes list until fiat implementation is added.
 */
export async function getFiatQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<unknown>[]> {
  const { messenger, transaction } = request;
  const transactionId = transaction.id;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const selectedPaymentMethodId = transactionData.fiatPayment
    ?.selectedPaymentMethodId as string;
  const amountString = transactionData.fiatPayment?.amount;
  const walletAddress = transaction.txParams.from;
  const amount = Number(amountString);

  try {
    const quotes = await messenger.call('RampsController:getQuotes', {
      amount,
      fiat: 'usd',
      paymentMethods: [selectedPaymentMethodId],
      walletAddress,
    });

    log('Fetched fiat quotes', {
      amount,
      paymentMethods: [selectedPaymentMethodId],
      quotes,
      transactionId,
      walletAddress,
    });

    const quote = pickQuote(quotes as QuotesResponse);

    if (quote) {
      return [];
    }
  } catch (error) {
    log('Failed to fetch fiat quotes', { error, transactionId });
  }

  return [];
}

function pickQuote(quotes: QuotesResponse): Quote | undefined {
  return quotes.success?.find(
    // Implement to find most reliable quote but return transak for now
    (quote) => quote.provider === '/providers/transak-native-staging',
  );
}
