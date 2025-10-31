import { StatusTypes } from '@metamask/bridge-controller';
import type { QuoteMetadata } from '@metamask/bridge-controller';
import type { QuoteResponse } from '@metamask/bridge-controller';
import type { BridgeHistoryItem } from '@metamask/bridge-status-controller';
import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { refreshQuote } from './bridge-quotes';
import type { TransactionPayBridgeQuote } from './types';
import { projectLogger } from '../../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

const log = createModuleLogger(projectLogger, 'bridge-strategy');

export type SubmitBridgeQuotesRequest = {
  from: Hex;
  isSmartTransaction: (chainId: Hex) => boolean;
  messenger: TransactionPayControllerMessenger;
  quotes: TransactionPayQuote<TransactionPayBridgeQuote>[];
  transaction: TransactionMeta;
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
  const { quotes, messenger, transaction } = request;

  if (!quotes?.length) {
    log('No quotes found');
    return;
  }

  // Currently we only support a single source meaning we only check the first quote.
  const isSameChain =
    quotes[0].original.quote.srcChainId ===
    quotes[0].original.quote.destChainId;

  if (isSameChain) {
    log(
      'Ignoring quotes as source is same chain',
      quotes[0].original.quote.srcChainId,
    );
    return;
  }

  let index = 0;

  for (const quote of quotes) {
    log('Submitting bridge', index, quote);

    const finalQuote =
      index > 0
        ? await refreshQuote(quote, messenger as never, transaction)
        : quote.original;

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
  originalQuote: QuoteResponse,
): Promise<void> {
  const { isSmartTransaction, messenger, from, transaction } = request;
  const quote = cloneDeep(originalQuote);
  const sourceChainId = toHex(quote.quote.srcChainId);
  const isSTX = isSmartTransaction(sourceChainId);
  const requiredTransactionIds: string[] = [];

  const bridgeTransactionIdCollector = collectTransactionIds(
    sourceChainId,
    from,
    messenger,
    (id) =>
      updateTransaction(
        {
          transactionId: transaction.id,
          messenger,
          note: 'Add required transaction ID',
        },
        (transactionMeta) => {
          if (!transactionMeta.requiredTransactionIds) {
            transactionMeta.requiredTransactionIds = [];
          }

          transactionMeta?.requiredTransactionIds.push(id);
          requiredTransactionIds.push(id);
        },
      ),
  );

  const tokenAmountValues = {
    amount: '0',
    valueInCurrency: null,
    usd: null,
  };

  const metadata: QuoteMetadata = {
    gasFee: {
      effective: tokenAmountValues,
      max: tokenAmountValues,
      total: tokenAmountValues,
    },
    totalNetworkFee: tokenAmountValues,
    totalMaxNetworkFee: tokenAmountValues,
    toTokenAmount: tokenAmountValues,
    minToTokenAmount: tokenAmountValues,
    adjustedReturn: tokenAmountValues,
    sentAmount: tokenAmountValues,
    swapRate: '0',
    cost: tokenAmountValues,
  };

  const result = await messenger.call(
    'BridgeStatusController:submitTx',
    from,
    { ...quote, ...metadata },
    isSTX,
  );

  bridgeTransactionIdCollector.end();

  log('Bridge transaction submitted', {
    requiredTransactionIds,
    result,
  });

  await Promise.all(
    requiredTransactionIds.map((id) =>
      waitForTransactionConfirmed(id, messenger),
    ),
  );

  log('All required transactions confirmed', requiredTransactionIds);

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
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isComplete = (item?: BridgeHistoryItem, fn?: () => void) => {
      const status = item?.status?.status;

      log('Checking bridge status', status ?? 'missing');

      if (status === StatusTypes.COMPLETE) {
        fn?.();
        resolve();
        return true;
      }

      if (status === StatusTypes.FAILED) {
        fn?.();
        reject(new Error('Bridge failed'));
        return true;
      }

      return false;
    };

    const initialState = messenger.call('BridgeStatusController:getState');

    const initialTx = initialState.txHistory[bridgeTransactionId];

    if (isComplete(initialTx)) {
      return;
    }

    const handler = (bridgeHistory?: BridgeHistoryItem) => {
      const unsubscribe = () =>
        messenger.unsubscribe('BridgeStatusController:stateChange', handler);

      isComplete(bridgeHistory, unsubscribe);
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
  messenger: TransactionPayControllerMessenger,
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
