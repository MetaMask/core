/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { isTronChainId } from '@metamask/bridge-controller';
import type {
  BitcoinTradeData,
  StellarTradeData,
  TronTradeData,
  TxData,
} from '@metamask/bridge-controller';

import { handleNonEvmTx } from '../utils/snaps.js';
import { getApprovalTraceParams } from '../utils/trace.js';
import { handleApprovalDelay } from '../utils/transaction.js';
import { SubmitStep } from './types.js';
import type { SubmitStrategyParams, SubmitStepResult } from './types.js';

/**
 * Submits the approval transaction for a non-EVM transaction if present
 *
 * @param args - The parameters for the transaction
 * @returns The tx id of the approval transaction
 */
const handleTronApproval = async (
  args: SubmitStrategyParams<
    TronTradeData | BitcoinTradeData | StellarTradeData | string | TxData
  >,
) => {
  const {
    quoteResponses: [quoteResponse],
    traceFn,
  } = args;

  const approvalTxId = await traceFn(
    getApprovalTraceParams(quoteResponse, false),
    async () => {
      if (quoteResponse.approval) {
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
 * Submits Solana, Bitcoin, or Tron transactions to the snap controller
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
  args: SubmitStrategyParams<
    BitcoinTradeData | StellarTradeData | TronTradeData | string | TxData
  >,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    quoteResponses: [quoteResponse],
    isBridgeTx,
  } = args;

  const approvalTxId = await handleTronApproval(args);

  // TODO bridge-status should update history with actionId if approvalTxId is present

  const tradeMeta = await handleNonEvmTx(
    args.messenger,
    quoteResponse.trade,
    quoteResponse,
    args.selectedAccount,
  );

  yield {
    type: SubmitStep.SetTradeMeta,
    payload: { tradeMeta },
  };

  yield {
    type: SubmitStep.AddHistoryItem,
    payload: {
      historyKey: tradeMeta.id,
      approvalTxId,
      bridgeTxMeta: {
        id: tradeMeta.id,
        hash: tradeMeta.hash,
      },
      quoteResponse,
    },
  };

  yield {
    type: SubmitStep.StartPolling,
    payload: {
      historyKey: tradeMeta.id,
    },
  };

  if (!isTronChainId(quoteResponse.quote.srcChainId) && !isBridgeTx) {
    yield {
      type: SubmitStep.PublishCompletedEvent,
      payload: {
        historyKey: tradeMeta.id,
      },
    };
  }
}
