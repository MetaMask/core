import { errorCodes } from '@metamask/rpc-errors';
import type {
  MetamaskPaySolanaExecution,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger, isObject } from '@metamask/utils';

import { projectLogger } from '../../logger.js';
import type {
  NonEvmTransactionPayQuote,
  PayStrategyExecuteResult,
  TransactionPayControllerMessenger,
} from '../../types.js';
import { getTransaction, updateTransaction } from '../../utils/transaction.js';
import { RELAY_SOLANA_CHAIN_ID } from './constants.js';
import { notifyRelayTransaction } from './relay-api.js';
import { submitPostNonAtomic, waitForRelayCompletion } from './relay-submit.js';
import {
  getRelaySolanaTransaction,
  getSolanaPayFailure,
  getSolanaSourceAddress,
  isMoneyAccountRequest,
  isSolanaPayProductTransaction,
  persistSolanaExecution,
} from './solana-pay.js';
import {
  compileRelaySolanaTransaction,
  getAccountSnapId,
  signAndSendSolanaTransaction,
} from './solana-transaction.js';
import type { RelayCompletionOutcome, RelaySolanaPayQuote } from './types.js';

const log = createModuleLogger(projectLogger, 'relay-submit-non-evm');

/** Snap errors guaranteed to have happened before broadcast. */
const NOT_SUBMITTED_ERROR_CODES: number[] = [
  errorCodes.rpc.invalidRequest,
  errorCodes.rpc.invalidParams,
];

/**
 * Executes a Relay quote paid with a non-EVM payment token.
 *
 * Modelled on bridge-status-controller `submitNonEvmHandler`: Core signs and
 * broadcasts through the account Snap with exactly one `signAndSendTransaction`
 * request, then observes settlement through Relay. The `attempting` checkpoint
 * is persisted before crossing the Snap boundary so a restart never signs a
 * second time.
 *
 * Blockhash lifetime: the transaction is compiled at quote time and quotes are
 * refreshed every 30 seconds, well inside the ~60 to 90 second blockhash
 * validity. The transaction is recompiled with a fresh blockhash before
 * signing so the user approval is never rejected for an expired blockhash.
 *
 * @param request - Execution request.
 * @param request.messenger - Controller messenger.
 * @param request.quote - Non-EVM Relay quote to execute.
 * @param request.transaction - Target transaction.
 * @returns An externally handled publish result.
 */
export async function submitRelayNonEvmQuote({
  messenger,
  quote,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: NonEvmTransactionPayQuote<RelaySolanaPayQuote>;
  transaction: TransactionMeta;
}): Promise<PayStrategyExecuteResult> {
  const { id: transactionId } = transaction;

  // A persisted checkpoint means a previous attempt may have crossed the Snap
  // boundary, so only observe it and never sign again.
  if (getTransaction(transactionId, messenger)?.metamaskPay?.solanaExecution) {
    const status = await messenger.call(
      'TransactionPayController:reconcileSolanaPay',
      transactionId,
    );

    return {
      externallyHandled: true,
      outcome: status.submissionOutcome ?? 'ambiguous',
    };
  }

  if (!quote.original.metamask.affordability.isAffordable) {
    throw new Error('Solana source is not affordable');
  }

  const { request } = quote;
  const scope = request.sourceChainId;
  const snapId = getAccountSnapId(messenger, request.sourceWalletAccountId);

  const { transaction: unsignedTransaction } =
    await compileRelaySolanaTransaction({
      messenger,
      payer: getSolanaSourceAddress(request),
      scope,
      transaction: getRelaySolanaTransaction(quote.original),
    });

  const requiresNonAtomicFollowUp = isMoneyAccountRequest(request);

  const execution: MetamaskPaySolanaExecution = {
    atomicProductActionIncluded: Boolean(quote.original.request.txs?.length),
    atomicProductActionRequired:
      isSolanaPayProductTransaction(transaction) && !requiresNonAtomicFollowUp,
    followUpStatus: requiresNonAtomicFollowUp ? 'not-started' : 'not-required',
    notificationStatus: 'not-ready',
    phase: 'attempting',
    relayStatus: 'not-observed',
    requestId: quote.original.requestId,
    requiresNonAtomicFollowUp,
    sourceAmountRaw: quote.sourceAmount.raw,
    sourceChainId: scope,
    sourceStatus: 'not-observed',
    sourceWalletAccountId: request.sourceWalletAccountId,
  };

  persistSolanaExecution(
    messenger,
    transactionId,
    execution,
    'Start one Solana source attempt',
  );

  let snapResponse: unknown;

  try {
    snapResponse = await signAndSendSolanaTransaction({
      accountId: request.sourceWalletAccountId,
      messenger,
      scope,
      snapId,
      transaction: unsignedTransaction,
    });
  } catch (error) {
    return recordSnapFailure(messenger, transactionId, execution, error);
  }

  const sourceTransactionId = getSnapTransactionId(snapResponse);

  if (!sourceTransactionId) {
    persistSolanaExecution(
      messenger,
      transactionId,
      { ...execution, phase: 'unknown', sourceStatus: 'unknown' },
      'Record ambiguous Solana source outcome',
    );

    return { externallyHandled: true, outcome: 'ambiguous' };
  }

  const submitted: MetamaskPaySolanaExecution = {
    ...execution,
    notificationStatus: 'pending',
    phase: 'submitted',
    sourceStatus: 'pending',
    sourceTransactionId,
  };

  persistSolanaExecution(
    messenger,
    transactionId,
    submitted,
    'Record submitted Solana source transaction',
  );

  await notifyRelay(messenger, transactionId, submitted, sourceTransactionId);

  return await completeExecution({ messenger, quote, transaction });
}

/**
 * Waits for Relay settlement, runs the optional non-atomic second leg, and
 * marks the intent complete once every leg has landed.
 *
 * @param request - Completion request.
 * @param request.messenger - Controller messenger.
 * @param request.quote - Submitted non-EVM Relay quote.
 * @param request.transaction - Target transaction.
 * @returns An externally handled publish result.
 */
async function completeExecution({
  messenger,
  quote,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: NonEvmTransactionPayQuote<RelaySolanaPayQuote>;
  transaction: TransactionMeta;
}): Promise<PayStrategyExecuteResult> {
  const { id: transactionId } = transaction;

  const completion = await waitForRelayCompletion(quote.original, messenger, {
    tolerateFailure: true,
  });

  log('Relay Solana request completed', completion);

  const status = await messenger.call(
    'TransactionPayController:reconcileSolanaPay',
    transactionId,
  );

  const failure = getSolanaPayFailure(status);

  if (failure) {
    throw new Error(failure);
  }

  if (completion.status !== 'success') {
    // Polling timed out; restart-safe recovery keeps observing Relay.
    return { externallyHandled: true, outcome: 'submitted' };
  }

  if (status.followUpStatus === 'not-started') {
    await submitFollowUp({ completion, messenger, quote, transaction });
  }

  updateTransaction(
    {
      transactionId,
      messenger,
      note: 'Intent complete after Relay Solana completion',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );

  return { externallyHandled: true, outcome: 'submitted' };
}

/**
 * Runs the one-shot non-atomic Money Account second leg after Relay success.
 *
 * @param request - Follow-up request.
 * @param request.completion - Relay completion outcome.
 * @param request.messenger - Controller messenger.
 * @param request.quote - Submitted non-EVM Relay quote.
 * @param request.transaction - Target transaction.
 */
async function submitFollowUp({
  completion,
  messenger,
  quote,
  transaction,
}: {
  completion: RelayCompletionOutcome;
  messenger: TransactionPayControllerMessenger;
  quote: NonEvmTransactionPayQuote<RelaySolanaPayQuote>;
  transaction: TransactionMeta;
}): Promise<void> {
  const { id: transactionId } = transaction;
  const execution = requireSolanaExecution(messenger, transactionId);

  persistSolanaExecution(
    messenger,
    transactionId,
    { ...execution, followUpStatus: 'attempting' },
    'Start one Money Account destination follow-up',
  );

  try {
    // Relay delivers the funds to the target account, not to an overridden
    // `request.from`, so the second leg must spend from the same account.
    const { transactionHash } = await submitPostNonAtomic({
      completion,
      messenger,
      quote: {
        ...quote,
        request: {
          ...quote.request,
          recipient: transaction.txParams.from as Hex,
        },
      },
      transaction,
    });

    persistSolanaExecution(
      messenger,
      transactionId,
      {
        ...execution,
        followUpStatus: 'confirmed',
        followUpTransactionId: transactionHash,
      },
      'Record Money Account destination follow-up: confirmed',
    );
  } catch (error) {
    persistSolanaExecution(
      messenger,
      transactionId,
      { ...execution, followUpStatus: 'failed' },
      'Record Money Account destination follow-up: failed',
    );

    throw error;
  }
}

function requireSolanaExecution(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): MetamaskPaySolanaExecution {
  const execution = getTransaction(transactionId, messenger)?.metamaskPay
    ?.solanaExecution;

  if (!execution) {
    throw new Error('Solana execution missing');
  }

  return execution;
}

async function notifyRelay(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
  execution: MetamaskPaySolanaExecution,
  sourceTransactionId: string,
): Promise<void> {
  const notificationStatus = await notifyRelayTransaction({
    chainId: String(RELAY_SOLANA_CHAIN_ID),
    requestId: execution.requestId,
    txHash: sourceTransactionId,
  }).then(
    () => 'success' as const,
    () => 'failure' as const,
  );

  persistSolanaExecution(
    messenger,
    transactionId,
    { ...execution, notificationStatus },
    'Record Relay indexing notification result',
  );
}

function recordSnapFailure(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
  execution: MetamaskPaySolanaExecution,
  error: unknown,
): PayStrategyExecuteResult {
  const code = isObject(error) ? error.code : undefined;
  const reason = error instanceof Error ? error.message : String(error);

  if (code === errorCodes.provider.userRejectedRequest) {
    persistSolanaExecution(
      messenger,
      transactionId,
      { ...execution, phase: 'user-rejected' },
      'Record Solana source outcome: user-rejected',
    );

    return { externallyHandled: true, outcome: 'user-rejected' };
  }

  if (typeof code === 'number' && NOT_SUBMITTED_ERROR_CODES.includes(code)) {
    persistSolanaExecution(
      messenger,
      transactionId,
      { ...execution, phase: 'not-submitted', sourceFailureReason: reason },
      'Record Solana source outcome: not-submitted',
    );

    return { error: reason, externallyHandled: true, outcome: 'not-submitted' };
  }

  persistSolanaExecution(
    messenger,
    transactionId,
    {
      ...execution,
      phase: 'unknown',
      sourceFailureReason: reason,
      sourceStatus: 'unknown',
    },
    'Record ambiguous Solana source outcome',
  );

  return { externallyHandled: true, outcome: 'ambiguous' };
}

function getSnapTransactionId(response: unknown): string | undefined {
  if (!isObject(response)) {
    return undefined;
  }

  const { transactionId, signature } = response;

  if (typeof transactionId === 'string' && transactionId) {
    return transactionId;
  }

  return typeof signature === 'string' && signature ? signature : undefined;
}
