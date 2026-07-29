/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  formatChainIdToHex,
  isEvmTxData,
  TxData,
} from '@metamask/bridge-controller';
import { TransactionType } from '@metamask/transaction-controller';

import { getJwt } from '../utils/authentication.js';
import {
  getIntentFromQuote,
  mapIntentOrderStatusToTransactionStatus,
  postSubmitOrder,
} from '../utils/intent-api.js';
import { signTypedMessage } from '../utils/keyring.js';
import { getNetworkClientIdByChainId } from '../utils/network.js';
import {
  addSyntheticTransaction,
  waitForTxConfirmation,
} from '../utils/transaction.js';
import { handleEvmApprovals } from './evm-strategy.js';
import { SubmitStrategyParams, SubmitStepResult, SubmitStep } from './types.js';

/**
 * Submits a synthetic EVM transaction to the TransactionController in order to display the intent order's
 * status in theclients, before the actual transaction is finalized on chain. The resulting transaction
 * is only available locally and is not submitted to the chain.
 *
 * @param orderUid - The order uid of the intent transaction
 * @param args - The parameters for the transaction
 * @returns The tradeMeta for the synthetic transaction
 */
const handleSyntheticTx = async (
  orderUid: string,
  args: SubmitStrategyParams,
) => {
  const {
    quoteResponses: [quoteResponse],
    messenger,
    isBridgeTx,
    selectedAccount,
  } = args;
  const {
    quote: { srcChainId },
  } = quoteResponse;

  // Determine transaction type: swap for same-chain, bridge for cross-chain
  const transactionType = isBridgeTx
    ? /* c8 ignore start */
      TransactionType.bridge
    : /* c8 ignore end */
      TransactionType.swap;

  const networkClientId = getNetworkClientIdByChainId(messenger, srcChainId);

  // This is a synthetic transaction whose purpose is to be able
  // to track the order status via the history
  if (!isEvmTxData(quoteResponse.trade)) {
    throw new Error('Failed to submit intent: trade is not an EVM transaction');
  }
  const intent = getIntentFromQuote(quoteResponse);
  // This is a synthetic transaction whose purpose is to be able
  // to track the order status via the history
  /**
   * @deprecated use trade data from quote response instead
   */
  const intentTransactionParams = {
    chainId: formatChainIdToHex(srcChainId),
    from: selectedAccount.address,
    to:
      intent.settlementContract ?? '0x9008D19f58AAbd9eD0D60971565AA8510560ab41', // Default settlement contract
    data: `0x${orderUid?.slice(-8)}`, // Use last 8 chars of orderUid to make each transaction unique
    value: '0x0',
    gas: '0x5208', // Minimal gas for display purposes
    gasPrice: '0x3b9aca00', // 1 Gwei - will be converted to EIP-1559 fees if network supports it
  };

  const initialTxMeta = await addSyntheticTransaction(
    messenger,
    intentTransactionParams,
    {
      requireApproval: false,
      networkClientId,
      type: transactionType,
    },
  );
  return initialTxMeta;
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
 * @returns The approvalTxId and tradeMeta for the non-EVM transaction
 */
const handleSubmitIntent = async (args: SubmitStrategyParams<TxData>) => {
  const {
    quoteResponses: [quoteResponse],
    messenger,
    selectedAccount,
    clientId,
    fetchFn,
    bridgeApiBaseUrl,
  } = args;
  const { srcChainId, requestId } = quoteResponse.quote;

  const intent = getIntentFromQuote(quoteResponse);
  const signature = await signTypedMessage({
    messenger,
    accountAddress: selectedAccount.address,
    typedData: intent.typedData,
  });

  const { id: orderUid, status } = await postSubmitOrder({
    params: {
      srcChainId,
      quoteId: requestId,
      signature,
      order: intent.order,
      userAddress: selectedAccount.address,
      aggregatorId: intent.protocol,
    },
    clientId,
    jwt: await getJwt(messenger),
    fetchFn,
    bridgeApiBaseUrl,
  });

  return {
    orderUid,
    orderStatus: status,
  };
};

/**
 * Submits an approval tx to the TransactionController,
 * posts an intent order to the bridge-api,
 * and creates a synthetic transaction in the TransactionController
 *
 * @param args - The parameters for the transaction
 * @param args.quoteResponse - The quote response
 * @param args.messenger - The messenger
 * @param args.selectedAccount - The selected account
 * @param args.traceFn - The trace function
 * @param args.isBridgeTx - Whether the transaction is a bridge transaction
 * @yields The approvalTxId and tradeMeta for the intent transaction
 */
export async function* submitIntentHandler(
  args: SubmitStrategyParams<TxData>,
): AsyncGenerator<SubmitStepResult, void, void> {
  // TODO handle STX/batch approvals
  const approvalTxId = await handleEvmApprovals(args);
  approvalTxId && (await waitForTxConfirmation(args.messenger, approvalTxId));

  // TODO add to history after approval tx is confirmed

  // Submit the intent order to the bridge-api
  const { orderUid, orderStatus } = await handleSubmitIntent(args);

  // Initialize a transaction in the TransactionController
  const syntheticTxMeta = await handleSyntheticTx(orderUid, {
    ...args,
    requireApproval: false,
    isStxEnabled: false,
  });

  // Use synthetic transaction metadata + translated intent order status as the tradeMeta
  yield {
    type: SubmitStep.SetTradeMeta,
    payload: {
      tradeMeta: {
        ...syntheticTxMeta,
        // Map intent order status to TransactionController status
        status: mapIntentOrderStatusToTransactionStatus(orderStatus),
      },
    },
  };

  // Update txHistory with synthetic txMeta and order id
  yield {
    type: SubmitStep.AddHistoryItem,
    payload: {
      // Use orderId as the history key for intent transactions
      historyKey: orderUid,
      bridgeTxMeta: {
        id: syntheticTxMeta?.id,
      },
      approvalTxId,
      // Keep original txId for TransactionController updates
      originalTransactionId: syntheticTxMeta?.id,
      quoteResponse: args.quoteResponses[0],
    },
  };

  // Start polling using the orderId as the history key
  yield {
    type: SubmitStep.StartPolling,
    payload: {
      historyKey: orderUid,
    },
  };
}
