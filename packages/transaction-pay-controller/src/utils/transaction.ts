import { Interface } from '@ethersproject/abi';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import type { Patch } from 'immer';
import { cloneDeep } from 'lodash';

import { projectLogger } from '../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayControllerState,
  UpdateTransactionDataCallback,
} from '../types';
import { rpcRequest } from './provider';
import { parseRequiredTokens } from './required-tokens';
import { getNativeToken } from './token';

const log = createModuleLogger(projectLogger, 'transaction');

export const FINALIZED_STATUSES = [
  TransactionStatus.confirmed,
  TransactionStatus.dropped,
  TransactionStatus.failed,
];

/**
 * Retrieve transaction metadata by ID.
 *
 * @param transactionId - ID of the transaction to retrieve.
 * @param messenger - Controller messenger.
 * @returns The transaction metadata or undefined if not found.
 */
export function getTransaction(
  transactionId: string,
  messenger: TransactionPayControllerMessenger,
): TransactionMeta | undefined {
  const transactionControllerState = messenger.call(
    'TransactionController:getState',
  );

  return transactionControllerState.transactions.find(
    (tx) => tx.id === transactionId,
  );
}

/**
 * Subscribe to transaction changes and update the transaction data accordingly.
 *
 * @param messenger - Controller messenger.
 * @param updateTransactionData - Callback to update transaction data.
 * @param removeTransactionData - Callback to remove transaction data.
 */
export function subscribeTransactionChanges(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
  removeTransactionData: (transactionId: string) => void,
): void {
  messenger.subscribe(
    'TransactionController:stateChange',
    (
      transactions: TransactionMeta[],
      previousTransactions: TransactionMeta[] | undefined,
    ) => {
      const newTransactions = transactions.filter(
        (tx) => !previousTransactions?.find((prevTx) => prevTx.id === tx.id),
      );

      const updatedTransactions = transactions.filter((tx) => {
        const previousTransaction = previousTransactions?.find(
          (prevTx) => prevTx.id === tx.id,
        );

        return (
          previousTransaction &&
          (previousTransaction?.txParams.data !== tx.txParams.data ||
            previousTransaction?.txParams.to !== tx.txParams.to ||
            JSON.stringify(previousTransaction?.requiredAssets) !==
              JSON.stringify(tx.requiredAssets))
        );
      });

      const finalizedTransactions = transactions.filter((tx) => {
        const previousTransaction = previousTransactions?.find(
          (prevTx) => prevTx.id === tx.id,
        );

        return (
          previousTransaction &&
          !FINALIZED_STATUSES.includes(previousTransaction.status) &&
          FINALIZED_STATUSES.includes(tx.status)
        );
      });

      const deletedTransactions = (previousTransactions ?? []).filter(
        (prevTx) => !transactions.find((tx) => tx.id === prevTx.id),
      );

      [...finalizedTransactions, ...deletedTransactions].forEach((tx) =>
        onTransactionFinalized(tx, removeTransactionData),
      );

      [...newTransactions, ...updatedTransactions].forEach((tx) =>
        onTransactionChange(tx, messenger, updateTransactionData),
      );
    },
    (state) => state.transactions,
  );
}

/**
 * Subscribe to asset state changes and re-parse required tokens for
 * in-flight transactions whose tokens have not yet resolved.
 *
 * Subscribes to all known asset event sources unconditionally, rather than
 * choosing a single source based on the unify-state feature flag. The flag
 * value can change between when this controller is constructed and when it
 * is read elsewhere (e.g. remote feature flags loading after startup), so
 * relying on it here to pick a single source risks missing the events that
 * actually fire. The handler is idempotent, so subscribing to extra sources
 * that never fire is harmless.
 *
 * @param messenger - Controller messenger.
 * @param getControllerState - Callback returning the current controller state.
 * @param updateTransactionData - Callback to update transaction data.
 */
export function subscribeAssetChanges(
  messenger: TransactionPayControllerMessenger,
  getControllerState: () => TransactionPayControllerState,
  updateTransactionData: UpdateTransactionDataCallback,
): void {
  const buildHandler =
    (source: string) =>
    (_state: unknown, patches: Patch[] | undefined): void => {
      const { transactionData } = getControllerState();

      for (const [transactionId, data] of Object.entries(transactionData)) {
        if (data.tokens.length > 0) {
          continue;
        }

        const transaction = getTransaction(transactionId, messenger);

        if (!transaction || FINALIZED_STATUSES.includes(transaction.status)) {
          continue;
        }

        log('Asset data changed', { transactionId, source, patches });

        onTransactionChange(transaction, messenger, updateTransactionData);
      }
    };

  messenger.subscribe(
    'AssetsController:stateChange',
    buildHandler('AssetsController'),
  );
  messenger.subscribe(
    'TokensController:stateChange',
    buildHandler('TokensController'),
  );
  messenger.subscribe(
    'TokenRatesController:stateChange',
    buildHandler('TokenRatesController'),
  );
  messenger.subscribe(
    'CurrencyRateController:stateChange',
    buildHandler('CurrencyRateController'),
  );
}

/**
 * Wait for a transaction to be confirmed or fail.
 *
 * @param transactionId - ID of the transaction to wait for.
 * @param messenger - Controller messenger.
 * @returns A promise that resolves when the transaction is confirmed or rejects if it fails.
 */
export function waitForTransactionConfirmed(
  transactionId: string,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const isConfirmed = (tx?: TransactionMeta, fn?: () => void): boolean => {
      log('Checking transaction status', tx?.status, tx?.type);

      if (tx?.status === TransactionStatus.confirmed) {
        fn?.();
        resolve();
        return true;
      }

      if (
        [TransactionStatus.dropped, TransactionStatus.failed].includes(
          tx?.status as TransactionStatus,
        )
      ) {
        fn?.();
        reject(
          new Error(`Transaction failed - ${tx?.type} - ${tx?.error?.message}`),
        );
        return true;
      }

      return false;
    };

    const initialState = messenger.call('TransactionController:getState');

    const initialTx = initialState.transactions.find(
      (singleTransaction) => singleTransaction.id === transactionId,
    );

    if (isConfirmed(initialTx)) {
      return;
    }

    const handler = (tx?: TransactionMeta): void => {
      const unsubscribe = (): void =>
        messenger.unsubscribe('TransactionController:stateChange', handler);

      isConfirmed(tx, unsubscribe);
    };

    messenger.subscribe('TransactionController:stateChange', handler, (state) =>
      state.transactions.find((tx) => tx.id === transactionId),
    );
  });
}

/**
 * Update a transaction by applying a function to its draft.
 *
 * @param request - Request object.
 * @param request.transactionId - ID of the transaction to update.
 * @param request.messenger - Controller messenger.
 * @param request.note - Note describing the update.
 * @param fn - Function that applies updates to the transaction draft.
 */
export function updateTransaction(
  {
    transactionId,
    messenger,
    note,
  }: {
    transactionId: string;
    messenger: TransactionPayControllerMessenger;
    note: string;
  },
  fn: (draft: TransactionMeta) => void,
): void {
  const transaction = getTransaction(transactionId, messenger as never);

  if (!transaction) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  const newTransaction = cloneDeep(transaction);

  fn(newTransaction);

  messenger.call(
    'TransactionController:updateTransaction',
    newTransaction,
    note,
  );
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
export function collectTransactionIds(
  chainId: Hex,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
  onTransaction: (transactionId: string) => void,
): { end: () => void } {
  const listener = (tx: TransactionMeta): void => {
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

  const end = (): void => {
    messenger.unsubscribe(
      'TransactionController:unapprovedTransactionAdded',
      listener,
    );
  };

  return { end };
}

/**
 * Check whether a transaction is a Predict withdrawal.
 *
 * Returns `true` when the transaction's own type is `predictWithdraw`, or
 * when any of its nested transactions has that type.
 *
 * @param transaction - Transaction metadata.
 * @returns `true` when the transaction is a Predict withdrawal.
 */
export function isPredictWithdrawTransaction(
  transaction: TransactionMeta,
): boolean {
  return (
    transaction.type === TransactionType.predictWithdraw ||
    (transaction.nestedTransactions?.some(
      (nt) => nt.type === TransactionType.predictWithdraw,
    ) ??
      false)
  );
}

/**
 * Handle a transaction change by updating its associated data.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @param updateTransactionData - Callback to update transaction data.
 */
function onTransactionChange(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
): void {
  const tokens = parseRequiredTokens(transaction, messenger);

  log('Transaction changed', { transaction, tokens });

  updateTransactionData(transaction.id, (data) => {
    data.tokens = tokens;
  });
}

/**
 * Handle a finalized transaction by removing its associated data.
 *
 * @param transaction - Transaction metadata.
 * @param removeTransactionData - Callback to remove transaction data.
 */
function onTransactionFinalized(
  transaction: TransactionMeta,
  removeTransactionData: (transactionId: string) => void,
): void {
  log('Transaction finalized', { transaction });
  removeTransactionData(transaction.id);
}

const erc20Interface = new Interface(abiERC20);

const ERC20_TRANSFER_EVENT_TOPIC = erc20Interface.getEventTopic('Transfer');

/**
 * Result from {@link getTransferredAmountFromTxHash}.
 */
export type TransferredAmountResult = {
  /** Raw (atomic) transferred amount as a decimal string, or `undefined`. */
  amountRaw: string | undefined;
  /**
   * Block number of the on-chain transaction as a 0x-prefixed hex string.
   * Populated only for ERC-20 tokens (sourced from the receipt); `undefined`
   * for native token transactions.
   */
  blockNumber: Hex | undefined;
};

/**
 * Reads the transferred token amount from a completed on-chain transaction.
 *
 * For native tokens the amount is resolved via `debug_traceTransaction`
 * (internal-call aware), falling back to the top-level `tx.value`.
 * For ERC-20 tokens the amount is decoded from `Transfer` event logs
 * in the transaction receipt, and the receipt `blockNumber` is also returned.
 *
 * @param options - The options.
 * @param options.messenger - Controller messenger for network access.
 * @param options.txHash - Transaction hash of the completed on-chain transaction.
 * @param options.chainId - Chain ID where the transaction was executed.
 * @param options.tokenAddress - Address of the transferred token.
 * @param options.walletAddress - Recipient wallet address to filter transfers to.
 * @returns The raw transferred amount and, for ERC-20, the receipt block number.
 */
export async function getTransferredAmountFromTxHash({
  messenger,
  txHash,
  chainId,
  tokenAddress,
  walletAddress,
}: {
  messenger: TransactionPayControllerMessenger;
  txHash: string;
  chainId: Hex;
  tokenAddress: Hex;
  walletAddress: Hex;
}): Promise<TransferredAmountResult> {
  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  if (isNative) {
    const amountRaw = await getNativeTransferAmount(
      messenger,
      chainId,
      txHash,
      walletAddress,
    );

    return { amountRaw, blockNumber: undefined };
  }

  return await getErc20TransferAmount(
    messenger,
    chainId,
    txHash,
    tokenAddress,
    walletAddress,
  );
}

/**
 * Resolves the native token amount received by a wallet from a transaction.
 *
 * 1. Attempts `debug_traceTransaction` with `callTracer` to walk internal
 *    calls and sum all native value transfers targeting `walletAddress`.
 * 2. Falls back to the top-level `tx.value` when the wallet is the direct
 *    recipient and the trace RPC is unavailable or errors.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID where the transaction was executed.
 * @param txHash - Transaction hash.
 * @param walletAddress - Recipient wallet address.
 * @returns Raw amount as a decimal string, or `undefined`.
 */
async function getNativeTransferAmount(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
  txHash: string,
  walletAddress: Hex,
): Promise<string | undefined> {
  try {
    const trace = await rpcRequest<CallTrace>({
      messenger,
      chainId,
      method: 'debug_traceTransaction',
      params: [txHash, { tracer: 'callTracer' }],
    });

    const amount = sumNativeValueFromTrace(trace, walletAddress);
    if (amount.gt(0)) {
      return amount.toFixed(0);
    }
  } catch {
    // debug_traceTransaction not supported — fall through to tx.value
  }

  const tx = await rpcRequest<{ to?: string; value: string } | null>({
    messenger,
    chainId,
    method: 'eth_getTransactionByHash',
    params: [txHash],
  });

  if (!tx) {
    return undefined;
  }

  if (tx.to?.toLowerCase() !== walletAddress.toLowerCase()) {
    return undefined;
  }

  return positiveOrUndefined(new BigNumber(tx.value).toFixed(0));
}

/**
 * Resolves the ERC-20 token amount received by a wallet from a transaction
 * by decoding `Transfer` event logs from the transaction receipt. Also
 * returns the receipt `blockNumber` so callers can reuse it without a
 * second network request.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID where the transaction was executed.
 * @param txHash - Transaction hash.
 * @param tokenAddress - ERC-20 token contract address.
 * @param walletAddress - Recipient wallet address.
 * @returns Raw amount (or `undefined`) and the receipt block number (or `undefined`).
 */
async function getErc20TransferAmount(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
  txHash: string,
  tokenAddress: Hex,
  walletAddress: Hex,
): Promise<TransferredAmountResult> {
  const receipt = await rpcRequest<{
    blockNumber: Hex;
    logs: { address: string; topics: string[]; data: string }[];
  } | null>({
    messenger,
    chainId,
    method: 'eth_getTransactionReceipt',
    params: [txHash],
  });

  if (!receipt) {
    return { amountRaw: undefined, blockNumber: undefined };
  }

  const { blockNumber } = receipt;
  let total = new BigNumber(0);

  for (const txLog of receipt.logs) {
    if (txLog.address.toLowerCase() !== tokenAddress.toLowerCase()) {
      continue;
    }

    if (!txLog.topics[0] || txLog.topics[0] !== ERC20_TRANSFER_EVENT_TOPIC) {
      continue;
    }

    try {
      const parsed = erc20Interface.parseLog(txLog);
      const to = (parsed.args[1] as string).toLowerCase();

      if (to !== walletAddress.toLowerCase()) {
        continue;
      }

      total = total.plus(parsed.args[2].toString());
    } catch {
      continue;
    }
  }

  return { amountRaw: positiveOrUndefined(total.toFixed(0)), blockNumber };
}

type CallTrace = {
  to?: string;
  value?: string;
  calls?: CallTrace[];
};

/**
 * Recursively walks a `callTracer` result and sums native value
 * transferred to a specific address.
 *
 * @param trace - Call trace node.
 * @param walletAddress - Target address to accumulate value for.
 * @returns Accumulated native value as BigNumber.
 */
function sumNativeValueFromTrace(
  trace: CallTrace,
  walletAddress: Hex,
): BigNumber {
  let total = new BigNumber(0);

  if (
    trace.to?.toLowerCase() === walletAddress.toLowerCase() &&
    trace.value &&
    trace.value !== '0x0'
  ) {
    total = total.plus(new BigNumber(trace.value));
  }

  if (trace.calls) {
    for (const child of trace.calls) {
      total = total.plus(sumNativeValueFromTrace(child, walletAddress));
    }
  }

  return total;
}

function positiveOrUndefined(amount: string): string | undefined {
  return new BigNumber(amount).gt(0) ? amount : undefined;
}
