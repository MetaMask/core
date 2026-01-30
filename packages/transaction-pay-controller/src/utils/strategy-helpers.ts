import type { TransactionParams } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction';
import type { PayStrategyExecuteRequest, TransactionPayQuote } from '../types';

const getNow = (): number =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

export type SourceTransaction = {
  params: TransactionParams;
  type: TransactionType;
};

type SubmitSourceTransactionsOptions<OriginalQuote> = {
  request: PayStrategyExecuteRequest<OriginalQuote>;
  buildTransactions: (quote: TransactionPayQuote<OriginalQuote>) => Promise<{
    chainId: Hex;
    from: Hex;
    transactions: SourceTransaction[];
    submit: (transactions: SourceTransaction[]) => Promise<void>;
  }>;
  requiredTransactionNote: string;
  intentCompleteNote?: string;
  markIntentComplete?: boolean;
};

/**
 * Submit source transactions for quotes and wait for confirmation.
 *
 * @param options - Submit options.
 * @returns The transaction hash of the last submitted transaction.
 */
export async function submitSourceTransactions<OriginalQuote>(
  options: SubmitSourceTransactionsOptions<OriginalQuote>,
): Promise<{ transactionHash?: Hex }> {
  const {
    request,
    buildTransactions,
    requiredTransactionNote,
    intentCompleteNote,
    markIntentComplete = true,
  } = options;
  const { quotes, messenger, onSubmitted, transaction } = request;

  let transactionHash: Hex | undefined;
  let hasReportedLatency = false;

  for (const quote of quotes) {
    const prepared = await buildTransactions(quote);
    const { chainId, from, transactions, submit } = prepared;

    updateTransaction(
      {
        transactionId: transaction.id,
        messenger,
        note: 'Remove nonce from skipped transaction',
      },
      (tx) => {
        tx.txParams.nonce = undefined;
      },
    );

    const transactionIds: string[] = [];

    const { end } = collectTransactionIds(chainId, from, messenger, (id) => {
      transactionIds.push(id);

      updateTransaction(
        {
          transactionId: transaction.id,
          messenger,
          note: requiredTransactionNote,
        },
        (tx) => {
          tx.requiredTransactionIds ??= [];
          tx.requiredTransactionIds.push(id);
        },
      );
    });

    const submitStart = getNow();
    await submit(transactions);

    if (!hasReportedLatency) {
      hasReportedLatency = true;
      // Guard against negative duration when clocks or mocks move backward.
      onSubmitted?.(Math.max(getNow() - submitStart, 0));
    }

    end();

    await Promise.all(
      transactionIds.map((txId) =>
        waitForTransactionConfirmed(txId, messenger),
      ),
    );

    if (markIntentComplete) {
      updateTransaction(
        {
          transactionId: transaction.id,
          messenger,
          note: intentCompleteNote ?? 'Intent complete',
        },
        (tx) => {
          tx.isIntentComplete = true;
        },
      );
    }

    transactionHash = getTransaction(transactionIds.slice(-1)[0], messenger)
      ?.hash as Hex;
  }

  return { transactionHash };
}
