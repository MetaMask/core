import type {
  AcceptResultCallbacks,
  AddResult,
} from '@metamask/approval-controller';
import { ApprovalType, ORIGIN_METAMASK } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type {
  FetchGasFeeEstimateOptions,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { bytesToHex, createModuleLogger } from '@metamask/utils';
import type { WritableDraft } from 'immer/dist/internal.js';
import { parse, v4 } from 'uuid';

import {
  ERROR_MESSGE_PUBLIC_KEY,
  doesChainSupportEIP7702,
  generateEIP7702BatchTransaction,
  isAccountUpgradedToEIP7702,
} from './eip7702';
import {
  getBatchSizeLimit,
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
} from './feature-flags';
import { simulateGasBatch } from './gas';
import { validateBatchRequest } from './validation';
import type { TransactionControllerState } from '..';
import {
  determineTransactionType,
  GasFeeEstimateLevel,
  TransactionStatus,
  type BatchTransactionParams,
  type TransactionController,
  type TransactionControllerMessenger,
  type TransactionMeta,
} from '..';
import { DefaultGasFeeFlow } from '../gas-flows/DefaultGasFeeFlow';
import { updateTransactionGasEstimates } from '../helpers/GasFeePoller';
import type { PendingTransactionTracker } from '../helpers/PendingTransactionTracker';
import { CollectPublishHook } from '../hooks/CollectPublishHook';
import { SequentialPublishBatchHook } from '../hooks/SequentialPublishBatchHook';
import { projectLogger } from '../logger';
import type {
  NestedTransactionMetadata,
  SecurityAlertResponse,
  TransactionBatchSingleRequest,
  PublishBatchHook,
  PublishBatchHookTransaction,
  PublishHook,
  TransactionBatchRequest,
  ValidateSecurityRequest,
  IsAtomicBatchSupportedResult,
  IsAtomicBatchSupportedResultEntry,
  TransactionBatchMeta,
} from '../types';
import {
  TransactionEnvelopeType,
  type TransactionBatchResult,
  type TransactionParams,
  TransactionType,
} from '../types';

type UpdateStateCallback = (
  callback: (
    state: WritableDraft<TransactionControllerState>,
  ) => void | TransactionControllerState,
) => void;

type AddTransactionBatchRequest = {
  addTransaction: TransactionController['addTransaction'];
  getChainId: (networkClientId: string) => Hex;
  getEthQuery: (networkClientId: string) => EthQuery;
  getGasFeeEstimates: (
    options: FetchGasFeeEstimateOptions,
  ) => Promise<GasFeeState>;
  getInternalAccounts: () => Hex[];
  getPendingTransactionTracker: (
    networkClientId: string,
  ) => PendingTransactionTracker;
  getTransaction: (id: string) => TransactionMeta;
  isSimulationEnabled: () => boolean;
  messenger: TransactionControllerMessenger;
  publishBatchHook?: PublishBatchHook;
  publishTransaction: (
    _ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<Hex>;
  publicKeyEIP7702?: Hex;
  request: TransactionBatchRequest;
  update: UpdateStateCallback;
  updateTransaction: (
    options: { transactionId: string },
    callback: (transactionMeta: TransactionMeta) => void,
  ) => void;
};

type IsAtomicBatchSupportedRequestInternal = {
  address: Hex;
  chainIds?: Hex[];
  getEthQuery: (chainId: Hex) => EthQuery;
  messenger: TransactionControllerMessenger;
  publicKeyEIP7702?: Hex;
};

const log = createModuleLogger(projectLogger, 'batch');

export const ERROR_MESSAGE_NO_UPGRADE_CONTRACT =
  'Upgrade contract address not found';

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
    getInternalAccounts,
    messenger,
    request: transactionBatchRequest,
  } = request;
  const sizeLimit = getBatchSizeLimit(messenger);

  validateBatchRequest({
    internalAccounts: getInternalAccounts(),
    request: transactionBatchRequest,
    sizeLimit,
  });

  log('Adding', transactionBatchRequest);

  if (!transactionBatchRequest.disable7702) {
    try {
      return await addTransactionBatchWith7702(request);
    } catch (error: unknown) {
      const isEIP7702NotSupportedError =
        error instanceof JsonRpcError &&
        error.message === 'Chain does not support EIP-7702';

      if (!isEIP7702NotSupportedError) {
        throw error;
      }
    }
  }

  return await addTransactionBatchWithHook(request);
}

/**
 * Determine which chains support atomic batch transactions for the given account.
 *
 * @param request - The request object including the account address and necessary callbacks.
 * @returns The chain IDs that support atomic batch transactions.
 */
export async function isAtomicBatchSupported(
  request: IsAtomicBatchSupportedRequestInternal,
): Promise<IsAtomicBatchSupportedResult> {
  const {
    address,
    chainIds,
    getEthQuery,
    messenger,
    publicKeyEIP7702: publicKey,
  } = request;

  if (!publicKey) {
    throw rpcErrors.internal(ERROR_MESSGE_PUBLIC_KEY);
  }

  const chainIds7702 = getEIP7702SupportedChains(messenger);

  const filteredChainIds = chainIds7702.filter(
    (chainId) => !chainIds || chainIds.includes(chainId),
  );

  const resultsRaw: (IsAtomicBatchSupportedResultEntry | undefined)[] =
    await Promise.all(
      filteredChainIds.map(async (chainId) => {
        try {
          const ethQuery = getEthQuery(chainId);

          const { isSupported, delegationAddress } =
            await isAccountUpgradedToEIP7702(
              address,
              chainId,
              publicKey,
              messenger,
              ethQuery,
            );

          const upgradeContractAddress = getEIP7702UpgradeContractAddress(
            chainId,
            messenger,
            publicKey,
          );

          return {
            chainId,
            delegationAddress,
            isSupported,
            upgradeContractAddress,
          };
        } catch (error) {
          log('Error checking atomic batch support', chainId, error);
          return undefined;
        }
      }),
    );

  const results = resultsRaw.filter(
    (result): result is IsAtomicBatchSupportedResultEntry => Boolean(result),
  );

  log('Atomic batch supported results', results);

  return results;
}

/**
 * Generate a transaction batch ID.
 *
 * @returns  A unique batch ID as a hexadecimal string.
 */
function generateBatchId(): Hex {
  const idString = v4();
  const idBytes = new Uint8Array(parse(idString));
  return bytesToHex(idBytes);
}

/**
 * Generate the metadata for a nested transaction.
 *
 * @param request - The batch request.
 * @param singleRequest - The request for a single transaction.
 * @param ethQuery - The EthQuery instance used to interact with the Ethereum blockchain.
 * @returns The metadata for the nested transaction.
 */
async function getNestedTransactionMeta(
  request: TransactionBatchRequest,
  singleRequest: TransactionBatchSingleRequest,
  ethQuery: EthQuery,
): Promise<NestedTransactionMetadata> {
  const { from } = request;
  const { params } = singleRequest;

  const { type } = await determineTransactionType(
    { from, ...params },
    ethQuery,
  );

  return {
    ...params,
    type,
  };
}

/**
 * Process a batch transaction using an EIP-7702 transaction.
 *
 * @param request - The request object including the user request and necessary callbacks.
 * @returns The batch result object including the batch ID.
 */
async function addTransactionBatchWith7702(
  request: AddTransactionBatchRequest,
) {
  const {
    addTransaction,
    getChainId,
    messenger,
    publicKeyEIP7702,
    request: userRequest,
  } = request;

  const {
    batchId: batchIdOverride,
    from,
    networkClientId,
    origin,
    requireApproval,
    securityAlertId,
    transactions,
    validateSecurity,
  } = userRequest;

  const chainId = getChainId(networkClientId);
  const ethQuery = request.getEthQuery(networkClientId);
  const isChainSupported = doesChainSupportEIP7702(chainId, messenger);

  if (!isChainSupported) {
    log('Chain does not support EIP-7702', chainId);
    throw rpcErrors.internal('Chain does not support EIP-7702');
  }

  if (!publicKeyEIP7702) {
    throw rpcErrors.internal(ERROR_MESSGE_PUBLIC_KEY);
  }

  const { delegationAddress, isSupported } = await isAccountUpgradedToEIP7702(
    from,
    chainId,
    publicKeyEIP7702,
    messenger,
    ethQuery,
  );

  log('Account', { delegationAddress, isSupported });

  if (!isSupported && delegationAddress) {
    log('Account upgraded to unsupported contract', from, delegationAddress);
    throw rpcErrors.internal('Account upgraded to unsupported contract');
  }

  const nestedTransactions = await Promise.all(
    transactions.map((tx) =>
      getNestedTransactionMeta(userRequest, tx, ethQuery),
    ),
  );

  const batchParams = generateEIP7702BatchTransaction(from, nestedTransactions);

  const txParams: TransactionParams = {
    from,
    ...batchParams,
  };

  if (!isSupported) {
    const upgradeContractAddress = getEIP7702UpgradeContractAddress(
      chainId,
      messenger,
      publicKeyEIP7702,
    );

    if (!upgradeContractAddress) {
      throw rpcErrors.internal(ERROR_MESSAGE_NO_UPGRADE_CONTRACT);
    }

    txParams.type = TransactionEnvelopeType.setCode;
    txParams.authorizationList = [{ address: upgradeContractAddress }];
  }

  if (validateSecurity) {
    const securityRequest: ValidateSecurityRequest = {
      method: 'eth_sendTransaction',
      params: [
        {
          ...txParams,
          authorizationList: undefined,
          type: TransactionEnvelopeType.feeMarket,
        },
      ],
      delegationMock: txParams.authorizationList?.[0]?.address,
      origin,
    };

    log('Security request', securityRequest);

    validateSecurity(securityRequest, chainId).catch((error) => {
      log('Security validation failed', error);
    });
  }

  log('Adding batch transaction', txParams, networkClientId);

  const batchId = batchIdOverride ?? generateBatchId();

  const securityAlertResponse = securityAlertId
    ? ({ securityAlertId } as SecurityAlertResponse)
    : undefined;

  const { result } = await addTransaction(txParams, {
    batchId,
    nestedTransactions,
    networkClientId,
    origin,
    requireApproval,
    securityAlertResponse,
    type: TransactionType.batch,
  });

  // Wait for the transaction to be published.
  await result;

  return {
    batchId,
  };
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
  const {
    messenger,
    publishBatchHook: requestPublishBatchHook,
    request: userRequest,
    update,
  } = request;

  const {
    from,
    networkClientId,
    requireApproval,
    transactions: nestedTransactions,
  } = userRequest;

  let resultCallbacks: AcceptResultCallbacks | undefined;

  log('Adding transaction batch using hook', userRequest);

  const sequentialPublishBatchHook = new SequentialPublishBatchHook({
    publishTransaction: request.publishTransaction,
    getTransaction: request.getTransaction,
    getEthQuery: request.getEthQuery,
    getPendingTransactionTracker: request.getPendingTransactionTracker,
  });

  let { disable7702, disableSequential } = userRequest;
  const { disableHook, useHook } = userRequest;

  // use hook is a temporary alias for disable7702 and disableSequential
  if (useHook) {
    disable7702 = true;
    disableSequential = true;
  }

  let publishBatchHook = null;

  if (!disableHook) {
    publishBatchHook = requestPublishBatchHook;
  } else if (!disableSequential) {
    publishBatchHook = sequentialPublishBatchHook.getHook();
  }

  if (!publishBatchHook) {
    log(`No supported batch methods found`, {
      disable7702,
      disableHook,
      disableSequential,
    });
    throw rpcErrors.internal(`Can't process batch`);
  }

  let txBatchMeta: TransactionBatchMeta | undefined;
  const batchId = generateBatchId();
  const transactionCount = nestedTransactions.length;
  const collectHook = new CollectPublishHook(transactionCount);
  try {
    if (requireApproval) {
      txBatchMeta = await prepareApprovalData({
        batchId,
        request,
      });

      resultCallbacks = (await requestApproval(txBatchMeta, messenger))
        .resultCallbacks;
    }

    const publishHook = collectHook.getHook();
    const hookTransactions: Omit<PublishBatchHookTransaction, 'signedTx'>[] =
      [];

    for (const nestedTransaction of nestedTransactions) {
      const hookTransaction = await processTransactionWithHook(
        batchId,
        nestedTransaction,
        publishHook,
        request,
        txBatchMeta,
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

    const transactionHashes = result.results.map(
      ({ transactionHash }) => transactionHash,
    );

    collectHook.success(transactionHashes);
    resultCallbacks?.success();

    log('Completed batch transaction with hook', transactionHashes);

    return {
      batchId,
    };
  } catch (error) {
    log('Publish batch hook failed', error);

    collectHook.error(error);
    resultCallbacks?.error(error as Error);

    throw error;
  } finally {
    log('Cleaning up publish batch hook', batchId);
    wipeTransactionBatchById(update, batchId);
  }
}

/**
 * Process a single transaction with a publish batch hook.
 *
 * @param batchId - ID of the transaction batch.
 * @param nestedTransaction - The nested transaction request.
 * @param publishHook - The publish hook to use for each transaction.
 * @param request - The request object including the user request and necessary callbacks.
 * @param txBatchMeta - Metadata for the transaction batch.
 * @returns The single transaction request to be processed by the publish batch hook.
 */
async function processTransactionWithHook(
  batchId: Hex,
  nestedTransaction: TransactionBatchSingleRequest,
  publishHook: PublishHook,
  request: AddTransactionBatchRequest,
  txBatchMeta?: TransactionBatchMeta,
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
      params,
    });

    return {
      id,
      params,
    };
  }

  const txMeta = { ...txBatchMeta, txParams: { ...params, from } };

  if (txBatchMeta) {
    updateTransactionGasEstimates({
      txMeta: txMeta as TransactionMeta,
      userFeeLevel: GasFeeEstimateLevel.Medium,
    });
  }

  const { transactionMeta } = await addTransaction(txMeta.txParams, {
    batchId,
    disableGasBuffer: true,
    networkClientId,
    publishHook,
    requireApproval: false,
  });

  const { id, txParams } = transactionMeta;
  const data = txParams.data as Hex | undefined;
  const gas = txParams.gas as Hex | undefined;
  const maxFeePerGas = txParams.maxFeePerGas as Hex | undefined;
  const maxPriorityFeePerGas = txParams.maxPriorityFeePerGas as Hex | undefined;
  const to = txParams.to as Hex | undefined;
  const value = txParams.value as Hex | undefined;

  const newParams: BatchTransactionParams = {
    data,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    to,
    value,
  };

  log('Processed new transaction with hook', { id, params: newParams });

  return {
    id,
    params: newParams,
  };
}

/**
 * Requests approval for a transaction batch by interacting with the ApprovalController.
 *
 * @param txBatchMeta - Metadata for the transaction batch, including its ID and origin.
 * @param messenger - The messenger instance used to communicate with the ApprovalController.
 * @returns A promise that resolves to the result of adding the approval request.
 */
async function requestApproval(
  txBatchMeta: TransactionBatchMeta,
  messenger: TransactionControllerMessenger,
): Promise<AddResult> {
  const id = String(txBatchMeta.id);
  const { origin } = txBatchMeta;
  const type = ApprovalType.TransactionBatch;
  const requestData = { txBatchId: id };

  log('Requesting approval for transaction batch', id);
  return (await messenger.call(
    'ApprovalController:addRequest',
    {
      id,
      origin: origin || ORIGIN_METAMASK,
      requestData,
      expectsResult: true,
      type,
    },
    true,
  )) as Promise<AddResult>;
}

/**
 * Adds batch metadata to the transaction controller state.
 *
 * @param transactionBatchMeta - The transaction batch metadata to be added.
 * @param update - The update function to modify the transaction controller state.
 */
function addBatchMetadata(
  transactionBatchMeta: TransactionBatchMeta,
  update: UpdateStateCallback,
) {
  update((state) => {
    state.transactionBatches = [
      ...state.transactionBatches,
      transactionBatchMeta,
    ];
  });
}

/**
 * Wipes a specific transaction batch from the transaction controller state by its ID.
 *
 * @param update - The update function to modify the transaction controller state.
 * @param id - The ID of the transaction batch to be wiped.
 */
function wipeTransactionBatchById(
  update: UpdateStateCallback,
  id: string,
): void {
  update((state) => {
    state.transactionBatches = state.transactionBatches.filter(
      (batch) => batch.id !== id,
    );
  });
}

/**
 * Create a new batch metadata object.
 *
 * @param transactionBatchMeta - The transaction batch metadata object to be created.
 * @returns A new TransactionBatchMeta object.
 */
function newBatchMetadata(
  transactionBatchMeta: Omit<TransactionBatchMeta, 'status'>,
): TransactionBatchMeta {
  return {
    ...transactionBatchMeta,
    status: TransactionStatus.unapproved,
  };
}

/**
 * Prepares the approval data for a transaction batch.
 *
 * @param options - The options object containing necessary parameters.
 * @param options.batchId - The batch ID for the transaction batch.
 * @param options.request - The request object including the user request and necessary callbacks.
 * @returns The prepared transaction batch metadata.
 */
async function prepareApprovalData({
  batchId,
  request,
}: {
  batchId: Hex;
  request: AddTransactionBatchRequest;
}): Promise<TransactionBatchMeta> {
  const {
    messenger,
    request: userRequest,
    isSimulationEnabled,
    getGasFeeEstimates,
    update,
    getEthQuery,
    getChainId,
  } = request;

  const {
    from,
    origin,
    networkClientId,
    transactions: nestedTransactions,
  } = userRequest;

  const ethQuery = getEthQuery(networkClientId);

  if (!isSimulationEnabled()) {
    throw new Error(
      'Cannot create transaction batch as simulation not supported',
    );
  }
  log('Preparing approval data for batch');
  const chainId = getChainId(networkClientId);

  const { gasLimit } = await simulateGasBatch({
    chainId,
    from,
    transactions: nestedTransactions,
  });

  const txBatchMeta: TransactionBatchMeta = newBatchMetadata({
    chainId,
    from,
    gas: gasLimit,
    id: batchId,
    networkClientId,
    origin,
    transactions: nestedTransactions,
  });

  const defaultGasFeeFlow = new DefaultGasFeeFlow();
  const gasFeeControllerData = await getGasFeeEstimates({
    networkClientId,
  });

  const gasFeeResponse = await defaultGasFeeFlow.getGasFees({
    ethQuery,
    gasFeeControllerData,
    messenger,
    transactionMeta: {
      ...txBatchMeta,
      txParams: {
        from,
        gas: gasLimit,
      },
      time: Date.now(),
    },
  });

  txBatchMeta.gasFeeEstimates = gasFeeResponse.estimates;

  log('Saving transaction batch metadata', txBatchMeta);
  addBatchMetadata(txBatchMeta, update);

  return txBatchMeta;
}
