import type {
  AcceptResultCallbacks,
  AddResult,
} from '@metamask/approval-controller';
import {
  ApprovalType,
  ORIGIN_METAMASK,
  toHex,
} from '@metamask/controller-utils';
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
import {
  determineTransactionType,
  GasFeeEstimateLevel,
  TransactionStatus,
} from '..';
import type {
  BatchTransactionParams,
  GetSimulationConfig,
  PublishBatchHookRequest,
  TransactionController,
  TransactionControllerMessenger,
  TransactionControllerState,
  TransactionMeta,
} from '..';
import { DefaultGasFeeFlow } from '../gas-flows/DefaultGasFeeFlow';
import { updateTransactionGasEstimates } from '../helpers/GasFeePoller';
import type { PendingTransactionTracker } from '../helpers/PendingTransactionTracker';
import { CollectPublishHook } from '../hooks/CollectPublishHook';
import { SequentialPublishBatchHook } from '../hooks/SequentialPublishBatchHook';
import { projectLogger } from '../logger';
import { TransactionEnvelopeType, TransactionType } from '../types';
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
import type { TransactionBatchResult, TransactionParams } from '../types';

type UpdateStateCallback = (
  callback: (
    state: WritableDraft<TransactionControllerState>,
  ) => void | TransactionControllerState,
) => void;

type AddTransactionBatchRequest = {
  addTransaction: TransactionController['addTransaction'];
  estimateGas: TransactionController['estimateGas'];
  getChainId: (networkClientId: string) => Hex;
  getEthQuery: (networkClientId: string) => EthQuery;
  getGasFeeEstimates: (
    options: FetchGasFeeEstimateOptions,
  ) => Promise<GasFeeState>;
  getInternalAccounts: () => Hex[];
  getPendingTransactionTracker: (
    networkClientId: string,
  ) => PendingTransactionTracker;
  getSimulationConfig: GetSimulationConfig;
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
  requestId?: string;
  signTransaction: (
    transactionMeta: TransactionMeta,
  ) => Promise<string | undefined>;
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
  const { params, type: requestedType } = singleRequest;

  if (requestedType) {
    return {
      ...params,
      type: requestedType,
    };
  }

  const { type: determinedType } = await determineTransactionType(
    { from, ...params },
    ethQuery,
  );

  return {
    ...params,
    type: determinedType,
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
): Promise<TransactionBatchResult> {
  const {
    addTransaction,
    getChainId,
    messenger,
    publicKeyEIP7702,
    request: userRequest,
  } = request;

  const {
    batchId: batchIdOverride,
    disableUpgrade,
    from,
    gasFeeToken,
    gasLimit7702,
    networkClientId,
    origin,
    overwriteUpgrade,
    requestId,
    requiredAssets,
    requireApproval,
    securityAlertId,
    skipInitialGasEstimate,
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

  let requiresUpgrade = false;

  if (!disableUpgrade) {
    const { delegationAddress, isSupported } = await isAccountUpgradedToEIP7702(
      from,
      chainId,
      publicKeyEIP7702,
      messenger,
      ethQuery,
    );

    log('Account', { delegationAddress, isSupported });

    if (!isSupported && delegationAddress && !overwriteUpgrade) {
      log('Account upgraded to unsupported contract', from, delegationAddress);
      throw rpcErrors.internal('Account upgraded to unsupported contract');
    }

    requiresUpgrade = !isSupported;

    if (requiresUpgrade && delegationAddress) {
      log('Overwriting authorization as already upgraded', {
        current: delegationAddress,
      });
    }
  }

  const nestedTransactions = await Promise.all(
    transactions.map((tx) =>
      getNestedTransactionMeta(userRequest, tx, ethQuery),
    ),
  );

  const batchParams = generateEIP7702BatchTransaction(from, nestedTransactions);

  const txParams: TransactionParams = {
    ...batchParams,
    from,
    gas: gasLimit7702,
    maxFeePerGas: nestedTransactions[0]?.maxFeePerGas,
    maxPriorityFeePerGas: nestedTransactions[0]?.maxPriorityFeePerGas,
  };

  if (requiresUpgrade) {
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

  const existingTransaction = transactions.find(
    (tx) => tx.existingTransaction,
  )?.existingTransaction;

  if (existingTransaction) {
    await convertTransactionToEIP7702({
      batchId,
      existingTransaction,
      nestedTransactions,
      request,
      txParams,
    });

    return { batchId };
  }

  const { result } = await addTransaction(txParams, {
    batchId,
    gasFeeToken,
    forceGasFeeToken: userRequest.forceGasFeeToken,
    isGasFeeIncluded: userRequest.isGasFeeIncluded,
    isGasFeeSponsored: userRequest.isGasFeeSponsored,
    nestedTransactions,
    networkClientId,
    origin,
    requestId,
    requireApproval,
    requiredAssets,
    securityAlertResponse,
    skipInitialGasEstimate,
    type: TransactionType.batch,
  });

  const transactionHash = await result;

  log('Batch transaction added', { batchId, transactionHash });

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
    batchId: batchIdOverride,
    from,
    networkClientId,
    origin,
    requireApproval,
    transactions: requestedTransactions,
  } = userRequest;

  let resultCallbacks: AcceptResultCallbacks | undefined;
  let isSequentialBatchHook = false;

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

  if (!disableHook && requestPublishBatchHook) {
    publishBatchHook = requestPublishBatchHook;
  } else if (!disableSequential) {
    publishBatchHook = sequentialPublishBatchHook.getHook();
    isSequentialBatchHook = true;
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
  const batchId = batchIdOverride ?? generateBatchId();

  const nestedTransactions = requestedTransactions.map((tx) => ({
    ...tx,
    origin,
  }));

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

    let index = 0;

    for (const nestedTransaction of nestedTransactions) {
      const hookTransaction = await processTransactionWithHook(
        batchId,
        nestedTransaction,
        publishHook,
        request,
        txBatchMeta,
        index,
      );

      hookTransactions.push(hookTransaction);
      index += 1;
    }

    const { signedTransactions } = await collectHook.ready();

    const transactions = hookTransactions.map((transaction, i) => ({
      ...transaction,
      signedTx: signedTransactions[i],
    }));

    const hookParams: PublishBatchHookRequest = {
      from,
      networkClientId,
      transactions,
    };

    log('Calling publish batch hook', hookParams);

    let result = await publishBatchHook(hookParams);

    log('Publish batch hook result', result);

    if (!result && !isSequentialBatchHook && !disableSequential) {
      log('Fallback to sequential publish batch hook due to empty results');
      const sequentialBatchHook = sequentialPublishBatchHook.getHook();
      result = await sequentialBatchHook(hookParams);
    }

    if (!result?.results?.length) {
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
 * @param index - The index of the transaction in the batch.
 * @returns The single transaction request to be processed by the publish batch hook.
 */
async function processTransactionWithHook(
  batchId: Hex,
  nestedTransaction: TransactionBatchSingleRequest,
  publishHook: PublishHook,
  request: AddTransactionBatchRequest,
  txBatchMeta: TransactionBatchMeta | undefined,
  index: number,
): Promise<
  Omit<PublishBatchHookTransaction, 'signedTx'> & { type?: TransactionType }
> {
  const { assetsFiatValues, existingTransaction, params, type } =
    nestedTransaction;

  const {
    addTransaction,
    getTransaction,
    request: userRequest,
    updateTransaction,
  } = request;

  const { from, networkClientId, origin } = userRequest;

  if (existingTransaction) {
    const { id, onPublish } = existingTransaction;
    let transactionMeta = getTransaction(id);
    const currentNonceHex = transactionMeta.txParams.nonce;
    let { signedTransaction } = existingTransaction;

    const currentNonceNum = currentNonceHex
      ? parseInt(currentNonceHex, 16)
      : undefined;

    const newNonce =
      index > 0 && currentNonceNum !== undefined
        ? currentNonceNum + index
        : undefined;

    updateTransaction({ transactionId: id }, (_transactionMeta) => {
      _transactionMeta.batchId = batchId;

      if (newNonce) {
        _transactionMeta.txParams.nonce = toHex(newNonce);
      }
    });

    if (newNonce) {
      const signResult = await updateTransactionSignature({
        transactionId: id,
        request,
      });

      signedTransaction = signResult.newSignature;
      transactionMeta = signResult.transactionMeta;
    }

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

  const transactionMetaForGasEstimates = {
    ...txBatchMeta,
    txParams: { ...params, from, gas: txBatchMeta?.gas ?? params.gas },
  };

  if (txBatchMeta) {
    updateTransactionGasEstimates({
      txMeta: transactionMetaForGasEstimates as TransactionMeta,
      userFeeLevel: GasFeeEstimateLevel.Medium,
    });
  }

  const { transactionMeta } = await addTransaction(
    transactionMetaForGasEstimates.txParams,
    {
      assetsFiatValues,
      batchId,
      disableGasBuffer: true,
      networkClientId,
      origin,
      publishHook,
      requireApproval: false,
      type,
    },
  );

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

  log('Processed new transaction with hook', {
    id,
    params: newParams,
    type,
  });

  return {
    id,
    params: newParams,
    type,
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
      origin: origin ?? ORIGIN_METAMASK,
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
): void {
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
    getChainId,
    getEthQuery,
    getGasFeeEstimates,
    getSimulationConfig,
    update,
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

  const { totalGasLimit: gasLimit } = await simulateGasBatch({
    chainId,
    from,
    getSimulationConfig,
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

/**
 * Convert an existing transaction to an EIP-7702 batch transaction.
 *
 * @param options - Options object.
 * @param options.batchId - Batch ID for the transaction batch.
 * @param options.existingTransaction - Existing transaction to be converted.
 * @param options.nestedTransactions - Nested transactions to be included in the batch.
 * @param options.request - Request object including the user request and necessary callbacks.
 * @param options.txParams - Transaction parameters for the new EIP-7702 transaction.
 * @param options.existingTransaction.id - ID of the existing transaction.
 * @param options.existingTransaction.onPublish - Callback for when the transaction is published.
 * @returns Promise that resolves after the publish callback has been invoked.
 */
async function convertTransactionToEIP7702({
  batchId,
  existingTransaction,
  nestedTransactions,
  request,
  txParams,
}: {
  batchId: Hex;
  request: AddTransactionBatchRequest;
  existingTransaction: {
    id: string;
    onPublish?: ({
      transactionHash,
      newSignature,
    }: {
      transactionHash: string | undefined;
      newSignature: Hex;
    }) => void;
  };
  nestedTransactions: NestedTransactionMetadata[];
  txParams: TransactionParams;
}): Promise<void> {
  const { getTransaction, estimateGas, updateTransaction } = request;
  const existingTransactionMeta = getTransaction(existingTransaction.id);

  if (!existingTransactionMeta) {
    throw new Error('Existing transaction not found');
  }

  log('Converting existing transaction to 7702', { batchId, txParams });

  const { networkClientId } = existingTransactionMeta;
  const newGasResult = await estimateGas(txParams, networkClientId);

  log('Estimated gas for converted EIP-7702 transaction', newGasResult);

  updateTransaction(
    { transactionId: existingTransactionMeta.id },
    (transactionMeta) => {
      transactionMeta.batchId = batchId;
      transactionMeta.nestedTransactions = nestedTransactions;
      transactionMeta.txParams = txParams;
      transactionMeta.txParams.gas = newGasResult.gas;
      transactionMeta.txParams.gasLimit = newGasResult.gas;
      transactionMeta.txParams.maxFeePerGas =
        existingTransactionMeta.txParams.maxFeePerGas;
      transactionMeta.txParams.maxPriorityFeePerGas =
        existingTransactionMeta.txParams.maxPriorityFeePerGas;
      transactionMeta.txParams.nonce = existingTransactionMeta.txParams.nonce;
      transactionMeta.txParams.type ??= TransactionEnvelopeType.feeMarket;
    },
  );

  const { newSignature } = await updateTransactionSignature({
    request,
    transactionId: existingTransactionMeta.id,
  });

  existingTransaction.onPublish?.({
    transactionHash: undefined,
    newSignature,
  });

  log('Transaction updated to EIP-7702', { batchId, txParams, newSignature });
}

/**
 * Update the signature of an existing transaction.
 *
 * @param options - Options object.
 * @param options.request - The request object including the user request and necessary callbacks.
 * @param options.transactionId - The ID of the transaction to update.
 * @returns An object containing the new signature and updated transaction metadata.
 */
async function updateTransactionSignature({
  request,
  transactionId,
}: {
  request: AddTransactionBatchRequest;
  transactionId: string;
}): Promise<{
  newSignature: Hex;
  transactionMeta: TransactionMeta;
}> {
  const { getTransaction, signTransaction } = request;
  const metadataToSign = getTransaction(transactionId);

  log('Re-signing existing transaction', {
    transactionId,
    txParams: metadataToSign.txParams,
  });

  const newSignature = (await signTransaction(metadataToSign)) as
    | Hex
    | undefined;

  if (!newSignature) {
    throw new Error('Failed to re-sign transaction');
  }

  const transactionMeta = getTransaction(transactionId);

  log('New signature', newSignature);

  return { newSignature, transactionMeta };
}
