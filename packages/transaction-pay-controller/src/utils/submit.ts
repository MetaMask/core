import type { Messenger } from '@metamask/base-controller';
import { StatusTypes } from '@metamask/bridge-controller';
import type { BridgeHistoryItem } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { projectLogger } from '../logger';
import type { TransactionBridgeQuote } from '../types';

const log = createModuleLogger(projectLogger, 'submit');

export type SubmitMessenger = Messenger<
  BridgeStatusControllerActions,
  | BridgeStatusControllerStateChangeEvent
  | TransactionControllerUnapprovedTransactionAddedEvent
>;

export type SubmitBridgeQuotesRequest = {
  from: Hex;
  isSmartTransaction: boolean;
  messenger: SubmitMessenger;
  quotes: TransactionBridgeQuote[];
  updateTransaction: (fn: (transactionMeta: TransactionMeta) => void) => void;
};

/**
 * Submit multiple bridge quotes sequentially and wait for their completion.
 *
 * @param request - The request object containing necessary data.
 * @returns An object containing the transaction hash if available.
 */
export async function submitBridgeQuotes(
  request: SubmitBridgeQuotesRequest,
): Promise<void> {
  const { quotes } = request;

  if (!quotes?.length) {
    log('No quotes found');
    return;
  }

  // Currently we only support a single source meaning we only check the first quote.
  const isSameChain =
    quotes[0].quote.srcChainId === quotes[0].quote.destChainId;

  if (isSameChain) {
    log('Ignoring quotes as source is same chain', quotes[0].quote.srcChainId);
    return;
  }

  let index = 0;

  for (const quote of quotes) {
    log('Submitting bridge', index, quote);

    const finalQuote = quote;

    await submitBridgeTransaction(request, finalQuote);

    index += 1;
  }
}

/**
 * Submit a bridge transaction and wait for it to complete.
 *
 * @param request - The request object containing necessary data.
 * @param originalQuote - The original quote to submit.
 */
async function submitBridgeTransaction(
  request: SubmitBridgeQuotesRequest,
  originalQuote: TransactionBridgeQuote,
): Promise<void> {
  const { isSmartTransaction, messenger, from, updateTransaction } = request;
  const quote = cloneDeep(originalQuote);
  const sourceChainId = toHex(quote.quote.srcChainId);

  const bridgeTransactionIdCollector = collectTransactionIds(
    sourceChainId,
    from,
    messenger,
    (id) =>
      updateTransaction((transactionMeta) => {
        if (!transactionMeta.requiredTransactionIds) {
          transactionMeta.requiredTransactionIds = [];
        }

        transactionMeta?.requiredTransactionIds.push(id);
      }),
  );

  const result = await messenger.call(
    'BridgeStatusController:submitTx',
    quote as never,
    isSmartTransaction,
  );

  bridgeTransactionIdCollector.end();

  log('Bridge transaction submitted', result);

  const { id: bridgeTransactionId } = result;

  log('Waiting for bridge completion', bridgeTransactionId);

  await waitForBridgeCompletion(bridgeTransactionId, messenger);
}

/**
 * Wait for a bridge transaction to complete.
 *
 * @param bridgeTransactionId - The bridge transaction ID.
 * @param messenger - The controller messenger.
 */
async function waitForBridgeCompletion(
  bridgeTransactionId: string,
  messenger: SubmitMessenger,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (bridgeHistory: BridgeHistoryItem) => {
      const unsubscribe = () =>
        messenger.unsubscribe('BridgeStatusController:stateChange', handler);

      const status = bridgeHistory?.status?.status;

      log('Checking bridge status', status);

      if (status === StatusTypes.COMPLETE) {
        unsubscribe();
        resolve();
      }

      if (status === StatusTypes.FAILED) {
        unsubscribe();
        reject(new Error('Bridge transaction failed'));
      }
    };

    messenger.subscribe(
      'BridgeStatusController:stateChange',
      handler,
      (state) => state.txHistory[bridgeTransactionId],
    );
  });
}

/**
 * Collect all new transactions until `end` is called.
 *
 * @param chainId - The chain ID to filter transactions by.
 * @param from - The address to filter transactions by.
 * @param messenger - The controller messenger.
 * @param onTransaction - Callback called with each matching transaction ID.
 * @returns An object with an `end` method to stop collecting transactions.
 */
function collectTransactionIds(
  chainId: Hex,
  from: Hex,
  messenger: SubmitMessenger,
  onTransaction: (transactionId: string) => void,
): { end: () => void } {
  const listener = (tx: TransactionMeta) => {
    if (
      tx.chainId !== chainId ||
      tx.txParams.from.toLowerCase() !== from.toLowerCase()
    ) {
      return;
    }

    onTransaction(tx.id);
  };

  messenger.subscribe(
    'TransactionController:unapprovedTransactionAdded',
    listener,
  );

  const end = () => {
    messenger.unsubscribe(
      'TransactionController:unapprovedTransactionAdded',
      listener,
    );
  };

  return { end };
}
