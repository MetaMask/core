import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import {
  doesChainSupportEIP7702,
  generateEIP7702BatchTransaction,
  isAccountUpgradedToEIP7702,
} from './eip7702';
import {
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
} from './feature-flags';
import { validateBatchRequest } from './validation';
import type {
  BatchTransactionParams,
  TransactionController,
  TransactionControllerMessenger,
  TransactionMeta,
} from '..';
import { CollectPublishHook } from '../hooks/CollectPublishHook';
import { projectLogger } from '../logger';
import type {
  PublishBatchHook,
  PublishBatchHookTransaction,
  PublishHook,
  TransactionBatchSingleRequest,
} from '../types';
import {
  TransactionEnvelopeType,
  type TransactionBatchRequest,
  type TransactionBatchResult,
  type TransactionParams,
  TransactionType,
} from '../types';

type AddTransactionBatchRequest = {
  addTransaction: TransactionController['addTransaction'];
  getChainId: (networkClientId: string) => Hex;
  getEthQuery: (networkClientId: string) => EthQuery;
  getInternalAccounts: () => Hex[];
  getTransaction: (id: string) => TransactionMeta;
  messenger: TransactionControllerMessenger;
  publishBatchHook?: PublishBatchHook;
  request: TransactionBatchRequest;
  updateTransaction: (
    options: { transactionId: string },
    callback: (transactionMeta: TransactionMeta) => void,
  ) => void;
};

type IsAtomicBatchSupportedRequest = {
  address: Hex;
  getEthQuery: (chainId: Hex) => EthQuery;
  messenger: TransactionControllerMessenger;
};

const log = createModuleLogger(projectLogger, 'batch');

/**
 * Add a batch transaction.
 *
 * @param request - The request object including the user request and necessary callbacks.
 * @returns The batch result object including the batch ID.
 */
export async function addTransactionBatch(
  request: AddTransactionBatchRequest,
): Promise<TransactionBatchResult> {
  const {
    addTransaction,
    getChainId,
    getInternalAccounts,
    messenger,
    request: userRequest,
  } = request;

  validateBatchRequest({
    internalAccounts: getInternalAccounts(),
    request: userRequest,
  });

  const { from, networkClientId, requireApproval, transactions, useHook } =
    userRequest;

  log('Adding', userRequest);

  if (useHook) {
    return await addTransactionBatchWithHook(request);
  }

  const chainId = getChainId(networkClientId);
  const ethQuery = request.getEthQuery(networkClientId);
  const isChainSupported = doesChainSupportEIP7702(chainId, messenger);

  if (!isChainSupported) {
    log('Chain does not support EIP-7702', chainId);
    throw rpcErrors.internal('Chain does not support EIP-7702');
  }

  const { delegationAddress, isSupported } = await isAccountUpgradedToEIP7702(
    from,
    chainId,
    messenger,
    ethQuery,
  );

  log('Account', { delegationAddress, isSupported });

  if (!isSupported && delegationAddress) {
    log('Account upgraded to unsupported contract', from, delegationAddress);
    throw rpcErrors.internal('Account upgraded to unsupported contract');
  }

  const nestedTransactions = transactions.map((tx) => tx.params);
  const batchParams = generateEIP7702BatchTransaction(from, nestedTransactions);

  const txParams: TransactionParams = {
    from,
    ...batchParams,
  };

  if (!isSupported) {
    const upgradeContractAddress = getEIP7702UpgradeContractAddress(
      chainId,
      messenger,
    );

    if (!upgradeContractAddress) {
      throw rpcErrors.internal('Upgrade contract address not found');
    }

    txParams.type = TransactionEnvelopeType.setCode;
    txParams.authorizationList = [{ address: upgradeContractAddress }];
  }

  log('Adding batch transaction', txParams, networkClientId);

  const { transactionMeta, result } = await addTransaction(txParams, {
    nestedTransactions,
    networkClientId,
    requireApproval,
    type: TransactionType.batch,
  });

  const batchId = transactionMeta.id;

  // Wait for the transaction to be published.
  await result;

  return {
    batchId,
  };
}

/**
 * Determine which chains support atomic batch transactions for the given account.
 *
 * @param request - The request object including the account address and necessary callbacks.
 * @returns The chain IDs that support atomic batch transactions.
 */
export async function isAtomicBatchSupported(
  request: IsAtomicBatchSupportedRequest,
): Promise<Hex[]> {
  const { address, getEthQuery, messenger } = request;

  const chainIds7702 = getEIP7702SupportedChains(messenger);
  const chainIds: Hex[] = [];

  for (const chainId of chainIds7702) {
    const ethQuery = getEthQuery(chainId);

    const { isSupported, delegationAddress } = await isAccountUpgradedToEIP7702(
      address,
      chainId,
      messenger,
      ethQuery,
    );

    if (!delegationAddress || isSupported) {
      chainIds.push(chainId);
    }
  }

  log('Atomic batch supported chains', chainIds);

  return chainIds;
}

/**
 * Process a batch transaction using a publish batch hook.
 *
 * @param request - The request object including the user request and necessary callbacks.
 * @returns The batch result object including the batch ID.
 */
async function addTransactionBatchWithHook(
  request: AddTransactionBatchRequest,
): Promise<TransactionBatchResult> {
  const { publishBatchHook, request: userRequest } = request;

  const {
    from,
    networkClientId,
    transactions: nestedTransactions,
  } = userRequest;

  log('Adding transaction batch using hook', userRequest);

  if (!publishBatchHook) {
    log('No publish batch hook provided');
    throw new Error('No publish batch hook provided');
  }

  const batchId = uuid();
  const transactionCount = nestedTransactions.length;
  const collectHook = new CollectPublishHook(transactionCount);
  const publishHook = collectHook.getHook();
  const hookTransactions: Omit<PublishBatchHookTransaction, 'signedTx'>[] = [];

  try {
    for (const nestedTransaction of nestedTransactions) {
      const hookTransaction = await processTransactionWithHook(
        batchId,
        nestedTransaction,
        publishHook,
        request,
      );

      hookTransactions.push(hookTransaction);
    }

    const { signedTransactions } = await collectHook.ready();

    const transactions = hookTransactions.map((transaction, index) => ({
      ...transaction,
      signedTx: signedTransactions[index],
    }));

    log('Calling publish batch hook', { from, networkClientId, transactions });

    const result = await publishBatchHook({
      from,
      networkClientId,
      transactions,
    });

    log('Publish batch hook result', result);

    if (!result) {
      throw new Error('Publish batch hook did not return a result');
    }

    const transactionHashes = result.map(
      ({ transactionHash }) => transactionHash,
    );

    collectHook.success(transactionHashes);

    log('Completed batch transaction with hook', transactionHashes);

    return {
      batchId,
    };
  } catch (error) {
    log('Publish batch hook failed', error);

    collectHook.error(error);

    throw error;
  }
}

/**
 * Process a single transaction with a publish batch hook.
 *
 * @param batchId - ID of the transaction batch.
 * @param nestedTransaction - The nested transaction request.
 * @param publishHook - The publish hook to use for each transaction.
 * @param request - The request object including the user request and necessary callbacks.
 * @returns The single transaction request to be processed by the publish batch hook.
 */
async function processTransactionWithHook(
  batchId: string,
  nestedTransaction: TransactionBatchSingleRequest,
  publishHook: PublishHook,
  request: AddTransactionBatchRequest,
) {
  const { existingTransaction, params } = nestedTransaction;

  const {
    addTransaction,
    getTransaction,
    request: userRequest,
    updateTransaction,
  } = request;

  const { from, networkClientId } = userRequest;

  if (existingTransaction) {
    const { id, onPublish, signedTransaction } = existingTransaction;
    const transactionMeta = getTransaction(id);

    const data = params.data as Hex | undefined;
    const to = params.to as Hex | undefined;
    const value = params.value as Hex | undefined;

    const existingParams: BatchTransactionParams = {
      data,
      to,
      value,
    };

    updateTransaction({ transactionId: id }, (_transactionMeta) => {
      _transactionMeta.batchId = batchId;
    });

    publishHook(transactionMeta, signedTransaction)
      .then(onPublish)
      .catch(() => {
        // Intentionally empty
      });

    log('Processed existing transaction with hook', {
      id,
      params: existingParams,
    });

    return {
      id,
      params: existingParams,
    };
  }

  const { transactionMeta } = await addTransaction(
    {
      ...params,
      from,
    },
    {
      batchId,
      networkClientId,
      publishHook,
      requireApproval: false,
    },
  );

  const { id, txParams } = transactionMeta;
  const data = txParams.data as Hex | undefined;
  const to = txParams.to as Hex | undefined;
  const value = txParams.value as Hex | undefined;

  const newParams: BatchTransactionParams = {
    data,
    to,
    value,
  };

  log('Processed new transaction with hook', { id, params: newParams });

  return {
    id,
    params: newParams,
  };
}
