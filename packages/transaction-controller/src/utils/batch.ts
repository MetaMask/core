/* eslint-disable promise/always-return */
/* eslint-disable jsdoc/require-jsdoc */

import { ORIGIN_METAMASK, toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { DeferredPromise, Hex } from '@metamask/utils';
import { createDeferredPromise, createModuleLogger } from '@metamask/utils';

import {
  CONTRACT_ADDRESS_7702,
  get7702Authorization,
  get7702Transaction,
  has7702Delegation,
  supports7702,
} from './7702';
import { waitForTransactionFinishedRemote } from './status';
import { normalizeTransactionParams } from './utils';
import { validateTxParams } from './validation';
import { projectLogger } from '../logger';
import type {
  PublishHook,
  TransactionController,
  TransactionControllerMessenger,
} from '../TransactionController';
import type {
  TransactionBatchApprovalData,
  TransactionBatchEntryResult,
  TransactionBatchRequest,
  TransactionBatchResult,
  TransactionMeta,
} from '../types';
import { TransactionEnvelopeType, TransactionStatus } from '../types';

export const APPROVAL_TYPE_TRANSACTION_BATCH = 'transaction_batch';

const log = createModuleLogger(projectLogger, 'batch');

export type AddTransactionBatchRequest = {
  addTransaction: TransactionController['addTransaction'];
  getChainId: (networkClientId: string) => Hex;
  getEthQuery: ({ networkClientId }: { networkClientId: string }) => EthQuery;
  getNextNonce: ({
    address,
    networkClientId,
  }: {
    address: string;
    networkClientId: string;
  }) => Promise<[string, (() => void) | undefined]>;
  messenger: TransactionControllerMessenger;
  publishBatch?: (
    signedTxs: string[],
  ) => Promise<{ transactionHash?: string[] }>;
  supportsEIP1559: (networkClientId: string) => Promise<boolean>;
  userRequest: TransactionBatchRequest;
  validateNetworkClientId: (networkClientId: string) => void;
};

export type TransactionBatchContext = {
  error?: Error;
  submitError?: Error;
  confirmError?: Error;
};

type ProcessTransactionResult = Awaited<ReturnType<typeof processTransaction>>;

export async function addTransactionBatch(
  request: AddTransactionBatchRequest,
): Promise<TransactionBatchResult> {
  log('Adding', request);

  const {
    publishBatch,
    supportsEIP1559,
    userRequest,
    validateNetworkClientId,
  } = request;
  const { networkClientId, requests, requireApproval } = userRequest;

  validateNetworkClientId(networkClientId);

  const is1559Supported = await supportsEIP1559(networkClientId);

  for (const entry of requests) {
    const { params } = entry;
    const normalizedParams = normalizeTransactionParams(params);

    validateTxParams(normalizedParams, is1559Supported);
  }

  log('Validated', requests);

  if (requireApproval !== false) {
    await createApprovalRequest(request);
  }

  const normalizedRequest = await normalizeRequest(request);

  const { publishAllPromise, publishHook, publishPromises, signedTxs } =
    await buildCollectorPublishHook(normalizedRequest);

  const finalPublishHook = publishBatch ? publishHook : undefined;
  const rawResults: ProcessTransactionResult[] = [];
  const finalRequests = normalizedRequest.userRequest.requests;

  for (let index = 0; index < finalRequests.length; index++) {
    const result = await processTransaction(
      normalizedRequest,
      index,
      finalPublishHook,
    );

    rawResults.push(result);
  }

  log('Add transactions processed');

  if (publishBatch) {
    await publishAllPromise;

    const publishResult = await publishBatch(signedTxs);

    for (const [index, promise] of publishPromises.entries()) {
      const { transactionHash } = publishResult;
      const hash = transactionHash?.[index];

      promise.resolve({ transactionHash: hash });
    }

    log('Published batch via hook', publishResult);
  }

  const waitForSubmit = () =>
    Promise.all(rawResults.map((result) => result.hash)).then(() => {
      log('All transactions submitted');
    });

  const waitForConfirm = () =>
    Promise.all(rawResults.map((result) => result.waitForConfirm())).then(
      () => {
        log('All transactions confirmed');
      },
    );

  const results: TransactionBatchEntryResult[] = rawResults.map(
    (rawResult) => ({
      transactionId: rawResult.transactionId,
    }),
  );

  log('Result', results);

  return {
    results,
    waitForConfirm,
    waitForSubmit,
  };
}

async function processTransaction(
  request: AddTransactionBatchRequest,
  index: number,
  publishHook: PublishHook | undefined,
) {
  const { userRequest } = request;
  const { requests, sequential } = userRequest;
  const entry = requests[index];

  log('Processing transaction', entry);

  const { transactionMeta, result: hash } = await addTransaction(
    request,
    index,
    publishHook,
  );

  const transactionId = transactionMeta?.id;
  const isLastRequest = index === requests.length - 1;

  const waitForConfirm = () =>
    waitForConfirmation(transactionId, request.messenger);

  if (sequential && !isLastRequest) {
    log(
      'Waiting for transaction submission as sequential batch',
      index,
      transactionId,
    );

    await hash;

    log(
      'Waiting for transaction confirmation as sequential batch',
      index,
      transactionId,
    );

    await waitForConfirm();
  }

  return {
    hash,
    transactionId,
    waitForConfirm,
  };
}

async function addTransaction(
  request: AddTransactionBatchRequest,
  index: number,
  publishHook: PublishHook | undefined,
): Promise<ReturnType<TransactionController['addTransaction']>> {
  const { addTransaction: controllerAddTransaction, userRequest } = request;
  const { networkClientId, requests, traceContext } = userRequest;
  const entry = requests[index];
  const { params, swaps, type } = entry;

  log('Adding transaction', index, params);

  try {
    const addResult = await controllerAddTransaction(params, {
      networkClientId,
      publishHook,
      requireApproval: false,
      swaps,
      traceContext,
      type,
    });

    log('Added transaction', index);

    addResult.result.catch((error) => {
      log('Error while submitting transaction', index, error);
    });

    return addResult;
  } catch (error) {
    log('Error while adding transaction', index, error);
    throw error;
  }
}

async function waitForConfirmation(
  transactionId: string,
  messenger: TransactionControllerMessenger,
): Promise<void> {
  log('Waiting for transaction to be confirmed', transactionId);

  const transactionMeta = await waitForTransactionFinishedRemote(
    transactionId,
    messenger,
  );

  const { status } = transactionMeta;

  if (status !== TransactionStatus.confirmed) {
    log('Transaction finalized but not confirmed', transactionId, status);

    throw new Error(
      `Transaction finalized but not confirmed - Status: ${status}`,
    );
  }

  log('Transaction was confirmed', transactionId);
}

async function createApprovalRequest(request: AddTransactionBatchRequest) {
  const { getChainId, getEthQuery, messenger, userRequest } = request;
  const { networkClientId, origin, requests } = userRequest;

  const transactions = requests.map((entry) => entry.params);
  const { from } = transactions[0];
  const ethQuery = getEthQuery({ networkClientId });
  const isSmartAccount = await has7702Delegation(from, ethQuery);
  const chainId = getChainId(networkClientId);
  const is7702Supported = await supports7702(chainId);
  const accountUpgradeRequired = !isSmartAccount && is7702Supported;

  const requestData: TransactionBatchApprovalData = {
    accountUpgradeRequired,
    chainId,
    networkClientId,
    transactions,
  };

  return await messenger.call(
    'ApprovalController:addRequest',
    {
      origin: origin || ORIGIN_METAMASK,
      type: APPROVAL_TYPE_TRANSACTION_BATCH,
      requestData,
    },
    true,
  );
}

async function buildCollectorPublishHook(request: AddTransactionBatchRequest) {
  const { userRequest } = request;
  const { requests } = userRequest;

  const signedTxs: string[] = [];
  const publishPromises: DeferredPromise<{ transactionHash?: string }>[] = [];
  const publishAllPromise = createDeferredPromise();

  const publishHook: PublishHook = async (
    _transactionMeta: TransactionMeta,
    signedTx: string,
  ) => {
    signedTxs.push(signedTx);

    log('Signed transaction', signedTx);

    const publishPromise = createDeferredPromise<{
      transactionHash?: string;
    }>();
    publishPromises.push(publishPromise);

    if (signedTxs.length === requests.length) {
      log('All transactions signed');

      publishAllPromise.resolve();
    }

    return publishPromise.promise;
  };

  return {
    publishAllPromise: publishAllPromise.promise,
    publishHook,
    publishPromises,
    signedTxs,
  };
}

async function normalizeRequest(
  request: AddTransactionBatchRequest,
): Promise<AddTransactionBatchRequest> {
  const { getChainId, getEthQuery, getNextNonce, userRequest } = request;
  const { networkClientId, requests } = userRequest;

  const { from } = requests[0].params;
  const ethQuery = getEthQuery({ networkClientId });
  const chainId = getChainId(networkClientId);
  const isSmartAccount = await has7702Delegation(from, ethQuery);
  const is7702Supported = await supports7702(chainId);

  if (!isSmartAccount && !is7702Supported) {
    return request;
  }

  const [nonce, releaseLock] = await getNextNonce({
    address: from,
    networkClientId,
  });

  releaseLock?.();

  const nextNonce = toHex(parseInt(nonce, 16) + 1);

  let params7702 = get7702Transaction(userRequest);

  if (!isSmartAccount) {
    params7702 = {
      ...params7702,
      type: TransactionEnvelopeType.setCode,
      authorizationList: [
        get7702Authorization(CONTRACT_ADDRESS_7702, chainId, nextNonce),
      ],
    };
  }

  return {
    ...request,
    userRequest: {
      ...userRequest,
      requests: [{ params: params7702 }],
    },
  };
}
