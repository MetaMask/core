/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  isBitcoinTrade,
  isTronChainId,
  isTronTrade,
} from '@metamask/bridge-controller';

import type { SubmitStrategyParams, SubmitStepResult } from './types';
import { handleNonEvmTx } from '../utils/snaps';
import { getApprovalTraceParams } from '../utils/trace';
import { handleApprovalDelay } from '../utils/transaction';

/**
 * Submits the approval transaction for a non-EVM transaction if present
 *
 * @param args - The parameters for the transaction
 * @returns The tx id of the approval transaction
 */
const handleTronApproval = async (args: SubmitStrategyParams) => {
  const { quoteResponse, traceFn } = args;

  const approvalTxId = await traceFn(
    getApprovalTraceParams(quoteResponse, false),
    async () => {
      if (quoteResponse.approval && isTronTrade(quoteResponse.approval)) {
        const txMeta = await handleNonEvmTx(
          args.messenger,
          quoteResponse.approval,
          quoteResponse,
          args.selectedAccount,
        );
        return txMeta.id;
      }
      return undefined;
    },
  );

  if (approvalTxId) {
    // Add delay after approval similar to EVM flow
    await handleApprovalDelay(quoteResponse.quote.srcChainId);
    return approvalTxId;
  }
  return undefined;
};

/**
 * Submits batched EVM transactions to the TransactionController
 *
 * @param args - The parameters for the transaction
 * @param args.quoteResponse - The quote response
 * @param args.messenger - The messenger
 * @param args.selectedAccount - The selected account
 * @param args.traceFn - The trace function
 * @param args.isBridgeTx - Whether the transaction is a bridge transaction
 * @yields The approvalTxId and tradeMeta for the non-EVM transaction
 */
export async function* submitNonEvmHandler(
  args: SubmitStrategyParams,
): AsyncGenerator<SubmitStepResult, void, void> {
  const { quoteResponse, isBridgeTx } = args;
  if (
    !(
      isTronTrade(quoteResponse.trade) ||
      isBitcoinTrade(quoteResponse.trade) ||
      typeof quoteResponse.trade === 'string'
    )
  ) {
    throw new Error(
      'Failed to submit cross-chain swap transaction: trade is not a non-EVM transaction',
    );
  }

  const approvalTxId = await handleTronApproval(args);

  // TODO bridge-status should update history with actionId if approvalTxId is present

  const tradeMeta = await handleNonEvmTx(
    args.messenger,
    quoteResponse.trade,
    quoteResponse,
    args.selectedAccount,
  );

  yield {
    type: 'setTradeMeta',
    payload: tradeMeta,
  };

  yield {
    type: 'addHistoryItem',
    payload: {
      approvalTxId,
      bridgeTxMeta: {
        id: tradeMeta.id,
        hash: tradeMeta.hash,
      },
    },
  };

  yield {
    type: 'startPolling',
    payload: tradeMeta.id,
  };

  if (!isTronChainId(quoteResponse.quote.srcChainId) && !isBridgeTx) {
    yield {
      type: 'publishCompletedEvent',
      payload: tradeMeta.id,
    };
  }
}
