import type { Hex, Json } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { getStrategy } from './strategy';
import { calculateTotals } from './totals';
import { getTransaction } from './transaction';
import { projectLogger } from '../logger';
import type {
  QuoteRequest,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  UpdateTransactionDataCallback,
} from '../types';

const log = createModuleLogger(projectLogger, 'quotes');

export type UpdateQuotesRequest = {
  messenger: TransactionPayControllerMessenger;
  transactionData: TransactionData | undefined;
  transactionId: string;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update the quotes for a specific transaction.
 *
 * @param request - Request parameters.
 */
export async function updateQuotes(request: UpdateQuotesRequest) {
  const { messenger, transactionData, transactionId, updateTransactionData } =
    request;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction || !transactionData) {
    throw new Error('Transaction not found');
  }

  const { paymentToken, sourceAmounts, tokens } = transactionData;

  if (!paymentToken || !sourceAmounts?.length) {
    throw new Error(
      'Cannot update quotes without payment token and source amounts',
    );
  }

  const requests: QuoteRequest[] = sourceAmounts.map((sourceAmount, i) => {
    const token = tokens[i];

    return {
      from: transaction.txParams.from as Hex,
      sourceBalanceRaw: paymentToken.balanceRaw,
      sourceTokenAmount: sourceAmount.sourceAmountRaw,
      sourceChainId: paymentToken.chainId,
      sourceTokenAddress: paymentToken.address,
      targetAmountMinimum: token.amountRaw,
      targetChainId: token.chainId,
      targetTokenAddress: token.address,
    };
  });

  let quotes: TransactionPayQuote<Json>[] | undefined;

  const strategy = await getStrategy(messenger as never, transaction);

  try {
    quotes = (await strategy.getQuotes({
      messenger,
      requests,
    })) as TransactionPayQuote<Json>[];
  } catch (error) {
    log('Error fetching quotes', { error, transactionId });
    return;
  }

  log('Updated', { transactionId, quotes });

  updateTransactionData(transactionId, (data) => {
    data.quotes = quotes as never;
    data.totals = calculateTotals(quotes as never, tokens, messenger);
    data.isLoading = false;
  });
}
