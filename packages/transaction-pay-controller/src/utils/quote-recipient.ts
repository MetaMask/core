import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../types.js';
import { getPostQuotePaymentOverrideData } from './post-quote-payment-override.js';

/**
 * Resolve the quote recipient used by both Relay and Server.
 *
 * Non-atomic execution must be funded on its execution account. Ordinary
 * post-quote withdrawals pay the selected receiving account (`accountOverride`,
 * falling back to `request.from`).
 * Deposits default to the original transaction's execution account.
 *
 * @param options - Recipient resolution options.
 * @param options.messenger - Controller messenger.
 * @param options.request - Quote request.
 * @param options.transaction - Original transaction metadata.
 * @returns The recipient to use for the quote body.
 */
export async function resolveQuoteRecipient({
  messenger,
  request,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  request: QuoteRequest;
  transaction: TransactionMeta;
}): Promise<Hex> {
  const executionAccount = transaction.txParams.from as Hex;

  if (request.atomic === false && request.isPostQuote) {
    // The client identifies the account executing target-side override calls.
    const { recipient } = await getPostQuotePaymentOverrideData({
      messenger,
      transaction,
    });

    return recipient;
  }

  if (request.atomic === false) {
    // Fund the original execution account before submitting its second leg.
    return executionAccount;
  }

  if (request.recipient) {
    // Preserve an explicit payout recipient once second-leg funding is handled.
    return request.recipient;
  }

  if (request.isPostQuote) {
    // Ordinary withdrawals pay the selected receiving account, which can differ
    // from the account executing the source withdrawal.
    return getPostQuoteRecipient({ messenger, request, transaction });
  }

  // Deposits default to the execution account, which can differ from the payer.
  return executionAccount;
}

/**
 * Resolve the account receiving an ordinary post-quote withdrawal: the
 * selected receiving account (`accountOverride`), falling back to `request.from`.
 *
 * @param options - Recipient resolution options.
 * @param options.messenger - Controller messenger.
 * @param options.request - Quote request.
 * @param options.transaction - Original transaction metadata.
 * @returns The post-quote recipient.
 */
export function getPostQuoteRecipient({
  messenger,
  request,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  request: QuoteRequest;
  transaction: TransactionMeta;
}): Hex {
  const { transactionData } = messenger.call(
    'TransactionPayController:getState',
  );

  return transactionData[transaction.id]?.accountOverride ?? request.from;
}
