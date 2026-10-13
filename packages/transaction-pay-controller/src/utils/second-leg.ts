import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import type {
  BatchTransactionParams,
  NestedTransactionMetadata,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../types.js';
import { withChompRecovery } from './chomp.js';
import { prefixError } from './error-prefix.js';
import { getNetworkClientId } from './provider.js';
import {
  collectTransactionIds,
  getTransaction,
  getTransferredAmountFromTxHash,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction.js';

export const SECOND_LEG_ERROR_PREFIX = 'Second leg: ';

const log = createModuleLogger(projectLogger, 'second-leg');

export type SecondLegCallsBuilder = (
  sourceAmountRaw: string,
) => Promise<BatchTransactionParams[]>;

/**
 * Derives the quote recipient for non-atomic flows, where the second leg runs
 * after settlement so funds must land directly on the account submitting that
 * leg.
 *
 * Post-quote flows (e.g. Perps/Predict withdraw to Money Account) ask the
 * client `getPaymentOverrideData` callback, which knows the Money Account
 * address that cannot be derived from the request. Non-post-quote flows (e.g.
 * max-amount Money Account deposit) use the parent transaction's own `from`,
 * which is the Money Account rather than the funding EOA in `request.from`.
 *
 * Atomic flows return `undefined`: the provider executes the calls as part of
 * the quote, so the funds must land on the account running them.
 *
 * @param transaction - Transaction metadata.
 * @param request - Quote request.
 * @param messenger - Controller messenger.
 * @returns The recipient address, or `undefined` for atomic flows.
 */
export async function resolveNonAtomicRecipient(
  transaction: TransactionMeta,
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<Hex | undefined> {
  if (request.atomic !== false) {
    return undefined;
  }

  if (!request.isPostQuote) {
    return transaction.txParams.from as Hex;
  }

  const { transactionData: transactionDataList } = messenger.call(
    'TransactionPayController:getState',
  );

  const transactionData = transactionDataList[transaction.id];
  const amountHuman = transactionData?.tokens?.[0]?.amountHuman ?? '0';

  const { recipient } = await messenger.call(
    'TransactionPayController:getPaymentOverrideData',
    {
      amount: amountHuman,
      transaction,
      transactionData,
    },
  );

  return recipient;
}

/**
 * Submits the second leg of a non-atomic flow: the calls that the quote could
 * not execute itself, run on the target chain once the first leg has settled.
 *
 * The single entrypoint for every strategy. The caller decides the chain, the
 * submitting account, the calls, and whether gas is sponsored, while
 * transaction-type-specific handling (e.g. {@link withChompRecovery}) is
 * applied here so it holds whichever strategy settled the funds.
 *
 * The amount spent is read from the settlement transaction's transfer logs
 * rather than trusted from a quote or provider, since slippage and fees mean
 * the landed amount is only known after settlement. Throws when there is no
 * settlement hash or no matching transfer, rather than guessing.
 *
 * @param options - Submit options.
 * @param options.chainId - Chain the funds settled on and the batch is
 * submitted on.
 * @param options.from - Account that received the settled funds and submits
 * the batch.
 * @param options.getCalls - Builds the batch for the settled amount. Derived
 * from the parent transaction's nested calls when omitted.
 * @param options.messenger - Controller messenger.
 * @param options.note - Note recorded against the parent transaction update.
 * @param options.settlementHash - Hash of the transaction that delivered the
 * funds to `from`.
 * @param options.sponsored - Whether gas is sponsored. Defaults to `true`,
 * since second legs run on chains where MetaMask sponsors gas; submission
 * fails rather than silently charging the user when sponsorship is refused.
 * @param options.tokenAddress - Token that settled.
 * @param options.transaction - Parent transaction meta.
 * @returns Hash of the final submitted child transaction, if available.
 */
export async function submitSecondLeg({
  chainId,
  from,
  getCalls,
  messenger,
  note,
  settlementHash,
  sponsored = true,
  tokenAddress,
  transaction,
}: {
  chainId: Hex;
  from: Hex;
  getCalls?: SecondLegCallsBuilder;
  messenger: TransactionPayControllerMessenger;
  note?: string;
  settlementHash: Hex | undefined;
  sponsored?: boolean;
  tokenAddress: Hex;
  transaction: TransactionMeta;
}): Promise<{ transactionHash?: Hex }> {
  const { amountRaw: sourceAmountRaw, fromBlock } = await resolveSettledAmount({
    chainId,
    messenger,
    recipient: from,
    settlementHash,
    tokenAddress,
  });

  // Resolved up front so the parent transaction reflects the settled amount
  // even when type-specific handling short-circuits the submission.
  const nestedTransactions = await resolveSecondLegCalls({
    getCalls,
    messenger,
    note,
    sourceAmountRaw,
    transaction,
  });

  try {
    return await withChompRecovery(
      { from, fromBlock, messenger, sourceAmountRaw, transaction },
      async () =>
        await submitBatch({
          chainId,
          from,
          messenger,
          nestedTransactions,
          sourceAmountRaw,
          sponsored,
          transaction,
        }),
    );
  } catch (error) {
    throw prefixError(error, SECOND_LEG_ERROR_PREFIX);
  }
}

/**
 * Resolves the calls to submit as the second leg.
 *
 * Callers with no calls on the parent transaction (e.g. withdraw flows) supply
 * `getCalls` to build the batch for the settled amount. Otherwise the parent
 * transaction's own nested calls are re-encoded for the settled amount via
 * `getAmountData`, and the parent transaction is mutated so its stored calls
 * and `requiredAssets` reflect that amount.
 *
 * @param options - Resolution options.
 * @param options.getCalls - Builds the batch for the settled amount, used
 * as-is when provided.
 * @param options.messenger - Controller messenger.
 * @param options.note - Note recorded against the parent transaction update.
 * @param options.sourceAmountRaw - Settled amount in raw units.
 * @param options.transaction - Parent transaction meta.
 * @returns Nested transactions to submit as the second leg.
 */
async function resolveSecondLegCalls({
  getCalls,
  messenger,
  note = 'Second leg: update amount',
  sourceAmountRaw,
  transaction,
}: {
  getCalls?: SecondLegCallsBuilder;
  messenger: TransactionPayControllerMessenger;
  note?: string;
  sourceAmountRaw: string;
  transaction: TransactionMeta;
}): Promise<NestedTransactionMetadata[]> {
  if (getCalls) {
    const calls = await getCalls(sourceAmountRaw);

    if (!calls.length) {
      throw new Error('Missing second leg calls');
    }

    return calls;
  }

  const transactionId = transaction.id;

  const updatedTransaction =
    getTransaction(transactionId, messenger) ?? transaction;

  const { updates } = await messenger.call(
    'TransactionPayController:getAmountData',
    {
      amount: sourceAmountRaw,
      transaction: updatedTransaction,
    },
  );

  if (!updates.length) {
    throw new Error('No amount updates');
  }

  const nestedTransactions = updatedTransaction.nestedTransactions?.map(
    (nestedTransaction) => ({ ...nestedTransaction }),
  );

  if (!nestedTransactions?.length) {
    throw new Error('Missing nested transactions');
  }

  for (const { nestedTransactionIndex, data } of updates) {
    if (nestedTransactions[nestedTransactionIndex]) {
      nestedTransactions[nestedTransactionIndex].data = data;
    }
  }

  updateTransaction({ transactionId, messenger, note }, (tx) => {
    for (const { nestedTransactionIndex, data } of updates) {
      if (tx.nestedTransactions?.[nestedTransactionIndex]) {
        tx.nestedTransactions[nestedTransactionIndex].data = data;
      }
    }

    if (tx.requiredAssets?.[0]) {
      tx.requiredAssets[0].amount = `0x${BigInt(sourceAmountRaw).toString(16)}`;
    }
  });

  return nestedTransactions;
}

/**
 * Resolves the amount that settled on `recipient`, read from the settlement
 * transaction's transfer logs, along with the block it settled in.
 *
 * @param options - Resolution options.
 * @param options.chainId - Chain the funds settled on.
 * @param options.messenger - Controller messenger.
 * @param options.recipient - Account that received the settled funds.
 * @param options.settlementHash - Hash of the transaction that delivered the
 * funds.
 * @param options.tokenAddress - Token that settled.
 * @returns The settled amount in raw units, and the settlement block when
 * available.
 */
async function resolveSettledAmount({
  chainId,
  messenger,
  recipient,
  settlementHash,
  tokenAddress,
}: {
  chainId: Hex;
  messenger: TransactionPayControllerMessenger;
  recipient: Hex;
  settlementHash: Hex | undefined;
  tokenAddress: Hex;
}): Promise<{ amountRaw: string; fromBlock: Hex | undefined }> {
  if (!settlementHash) {
    throw new Error('Missing settlement hash');
  }

  const { amountRaw, blockNumber } = await getTransferredAmountFromTxHash({
    chainId,
    messenger,
    tokenAddress,
    txHash: settlementHash,
    walletAddress: recipient,
  });

  if (!amountRaw) {
    throw new Error(
      `Could not determine settled amount from transaction ${settlementHash}`,
    );
  }

  log('Resolved settled amount', {
    amountRaw,
    blockNumber,
    chainId,
    recipient,
    settlementHash,
  });

  return { amountRaw, fromBlock: blockNumber };
}

/**
 * Submits the second-leg batch and waits for every child transaction to
 * confirm.
 *
 * @param options - Submit options.
 * @param options.chainId - Chain to submit the batch on.
 * @param options.from - Account submitting the batch.
 * @param options.messenger - Controller messenger.
 * @param options.nestedTransactions - Calls to submit.
 * @param options.sourceAmountRaw - Settled amount in raw units, for logging.
 * @param options.sponsored - Whether gas is sponsored.
 * @param options.transaction - Parent transaction meta.
 * @returns Hash of the final submitted child transaction.
 */
async function submitBatch({
  chainId,
  from,
  messenger,
  nestedTransactions,
  sourceAmountRaw,
  sponsored,
  transaction,
}: {
  chainId: Hex;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  nestedTransactions: NestedTransactionMetadata[];
  sourceAmountRaw: string;
  sponsored: boolean;
  transaction: TransactionMeta;
}): Promise<{ transactionHash: Hex }> {
  const transactionId = transaction.id;
  const networkClientId = getNetworkClientId(messenger, chainId);
  const transactionIds: string[] = [];

  const { end } = collectTransactionIds(chainId, from, messenger, (id) => {
    transactionIds.push(id);

    updateTransaction(
      {
        transactionId,
        messenger,
        note: 'Add required transaction ID from second leg submission',
      },
      (tx) => {
        tx.requiredTransactionIds ??= [];
        tx.requiredTransactionIds.push(id);
      },
    );
  });

  const logContext = {
    chainId,
    from,
    nestedTransactionCount: nestedTransactions.length,
    networkClientId,
    sourceAmountRaw,
    transactionId,
  };

  log('Submitting second leg', logContext);

  try {
    await messenger.call('TransactionController:addTransactionBatch', {
      disableHook: true,
      disableSequential: true,
      disableUpgrade: true,
      from,
      isGasFeeSponsored: sponsored,
      isInternal: true,
      networkClientId,
      origin: ORIGIN_METAMASK,
      requireApproval: false,
      skipInitialGasEstimate: true,
      transactions: nestedTransactions.map((nestedTransaction, index) => ({
        params: {
          data: nestedTransaction.data,
          to: nestedTransaction.to,
          value: nestedTransaction.value ?? '0x0',
        },
        type:
          index === 0
            ? (nestedTransaction.type ?? TransactionType.tokenMethodApprove)
            : TransactionType.contractInteraction,
      })),
    });
  } finally {
    end();
  }

  log('Submitted second leg', { ...logContext, transactionIds });

  if (!transactionIds.length) {
    throw new Error('No transactions submitted');
  }

  await Promise.all(
    transactionIds.map((id) => waitForTransactionConfirmed(id, messenger)),
  );

  const hash = getTransaction(transactionIds.slice(-1)[0], messenger)?.hash;

  if (!hash) {
    throw new Error('Missing transaction hash');
  }

  log('Confirmed second leg', { ...logContext, hash, transactionIds });

  return { transactionHash: hash as Hex };
}
