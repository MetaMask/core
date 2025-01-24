import { createModuleLogger } from '@metamask/utils';

import { waitForTransactionFinishedRemote } from './status';
import { normalizeTransactionParams } from './utils';
import { validateTxParams } from './validation';
import { projectLogger } from '../logger';
import type {
  TransactionController,
  TransactionControllerMessenger,
} from '../TransactionController';
import type {
  TransactionBatchEntryResult,
  TransactionBatchRequest,
  TransactionBatchResult,
} from '../types';
import { TransactionStatus } from '../types';

const log = createModuleLogger(projectLogger, 'batch');

export type AddTransactionBatchRequest = {
  addTransaction: TransactionController['addTransaction'];
  supportsEIP1559: (networkClientId: string) => Promise<boolean>;
  messenger: TransactionControllerMessenger;
  userRequest: TransactionBatchRequest;
  validateNetworkClientId: (networkClientId: string) => void;
};

export type TransactionBatchContext = {
  error?: Error;
  submitError?: Error;
  confirmError?: Error;
};

type ProcessTransactionResult = Awaited<ReturnType<typeof processTransaction>>;

/**
 *
 * @param request -
 * @returns -
 */
export async function addTransactionBatch(
  request: AddTransactionBatchRequest,
): Promise<TransactionBatchResult> {
  log('Adding', request);

  const { supportsEIP1559, userRequest, validateNetworkClientId } = request;
  const { networkClientId, requests } = userRequest;

  validateNetworkClientId(networkClientId);

  const is1559Supported = await supportsEIP1559(networkClientId);

  for (const entry of requests) {
    const { params } = entry;
    const normalizedParams = normalizeTransactionParams(params);

    validateTxParams(normalizedParams, is1559Supported);
  }

  log('Validated', requests);

  const rawResults: ProcessTransactionResult[] = [];

  for (let index = 0; index < requests.length; index++) {
    const result = await processTransaction(request, index);
    rawResults.push(result);
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

  log('Added successfully', results);

  return {
    results,
    waitForConfirm,
    waitForSubmit,
  };
}

/**
 *
 * @param request -
 * @param index -
 * @returns -
 */
async function processTransaction(
  request: AddTransactionBatchRequest,
  index: number,
) {
  const { userRequest } = request;
  const { requests, sequential } = userRequest;
  const entry = requests[index];

  log('Processing transaction', entry);

  const { transactionMeta, result: hash } = await addTransaction(
    request,
    index,
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

/**
 *
 * @param request -
 * @param index -
 * @returns -
 */
async function addTransaction(
  request: AddTransactionBatchRequest,
  index: number,
): Promise<ReturnType<TransactionController['addTransaction']>> {
  const { userRequest, addTransaction: controllerAddTransaction } = request;
  const { networkClientId, requests, traceContext } = userRequest;
  const entry = requests[index];
  const { params, swaps, type } = entry;

  log('Adding transaction', index, params);

  try {
    const addResult = await controllerAddTransaction(params, {
      networkClientId,
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

/**
 *
 * @param transactionId -
 * @param messenger -
 * @returns -
 */
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
