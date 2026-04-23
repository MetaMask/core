import {
  ORIGIN_METAMASK,
  successfulFetch,
  toHex,
} from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  BatchTransactionParams,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import { getAcrossOrderedTransactions } from './transactions';
import type { AcrossQuote } from './types';

const log = createModuleLogger(projectLogger, 'across-strategy');
const ACROSS_STATUS_POLL_INTERVAL = 1000;

type PreparedAcrossTransaction = {
  params: TransactionParams;
  type: TransactionType;
};

/**
 * Submit Across quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitAcrossQuotes(
  request: PayStrategyExecuteRequest<AcrossQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing quotes', request);

  const { quotes, messenger, transaction } = request;
  let transactionHash: Hex | undefined;

  for (const quote of quotes) {
    ({ transactionHash } = await executeSingleQuote(
      quote,
      messenger,
      transaction,
    ));
  }

  return { transactionHash };
}

async function executeSingleQuote(
  quote: TransactionPayQuote<AcrossQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<{ transactionHash?: Hex }> {
  log('Executing single quote', quote);

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Remove nonce from skipped transaction',
    },
    (tx) => {
      tx.txParams.nonce = undefined;
    },
  );

  const acrossDepositType = getAcrossDepositType(transaction.type);
  const transactionHash = await submitTransactions(
    quote,
    transaction.id,
    acrossDepositType,
    messenger,
  );

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Intent complete after Across submission',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );

  return { transactionHash };
}

/**
 * Submit transactions for an Across quote.
 *
 * @param quote - Across quote.
 * @param parentTransactionId - ID of the parent transaction.
 * @param acrossDepositType - Transaction type used for the swap/deposit step.
 * @param messenger - Controller messenger.
 * @returns Hash of the last submitted transaction, if available.
 */
async function submitTransactions(
  quote: TransactionPayQuote<AcrossQuote>,
  parentTransactionId: string,
  acrossDepositType: TransactionType,
  messenger: TransactionPayControllerMessenger,
): Promise<Hex | undefined> {
  const { swapTx } = quote.original.quote;
  const { gasLimits: quoteGasLimits, is7702 } = quote.original.metamask;
  const { from } = quote.request;
  const chainId = toHex(swapTx.chainId);
  const orderedTransactions = getAcrossOrderedTransactions({
    quote: quote.original.quote,
    swapType: acrossDepositType,
  });

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  const batchGasLimit =
    is7702 && orderedTransactions.length > 1
      ? quoteGasLimits[0]?.max
      : undefined;

  if (is7702 && orderedTransactions.length > 1 && batchGasLimit === undefined) {
    throw new Error('Missing quote gas limit for Across 7702 batch');
  }

  const gasLimit7702 =
    batchGasLimit === undefined ? undefined : toHex(batchGasLimit);

  const transactions: PreparedAcrossTransaction[] = orderedTransactions.map(
    (transaction, index) => {
      const gasLimit = gasLimit7702 ? undefined : quoteGasLimits[index]?.max;

      if (gasLimit === undefined && !gasLimit7702) {
        const errorMessage =
          transaction.kind === 'approval'
            ? `Missing quote gas limit for Across approval transaction at index ${index}`
            : 'Missing quote gas limit for Across swap transaction';

        throw new Error(errorMessage);
      }

      return {
        params: buildTransactionParams(from, {
          chainId: transaction.chainId,
          data: transaction.data,
          gasLimit,
          maxFeePerGas: transaction.maxFeePerGas,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
          to: transaction.to,
          value: transaction.value,
        }),
        type: transaction.type ?? acrossDepositType,
      };
    },
  );

  const transactionIds: string[] = [];

  const { end } = collectTransactionIds(
    chainId,
    from,
    messenger,
    (transactionId) => {
      transactionIds.push(transactionId);

      updateTransaction(
        {
          transactionId: parentTransactionId,
          messenger,
          note: 'Add required transaction ID from Across submission',
        },
        (tx) => {
          tx.requiredTransactionIds ??= [];
          tx.requiredTransactionIds.push(transactionId);
        },
      );
    },
  );

  let result: { result: Promise<string> } | undefined;

  try {
    if (transactions.length === 1) {
      result = await messenger.call(
        'TransactionController:addTransaction',
        transactions[0].params,
        {
          networkClientId,
          origin: ORIGIN_METAMASK,
          requireApproval: false,
          type: transactions[0].type,
        },
      );
    } else {
      const batchTransactions = transactions.map(({ params, type }) => ({
        params: toBatchTransactionParams(params),
        type,
      }));

      await messenger.call('TransactionController:addTransactionBatch', {
        disable7702: !gasLimit7702,
        disableHook: Boolean(gasLimit7702),
        disableSequential: Boolean(gasLimit7702),
        from,
        gasLimit7702,
        networkClientId,
        origin: ORIGIN_METAMASK,
        requireApproval: false,
        transactions: batchTransactions,
      });
    }
  } finally {
    end();
  }

  if (result) {
    const txHash = await result.result;
    log('Submitted transaction', txHash);
  }

  await Promise.all(
    transactionIds.map((txId) => waitForTransactionConfirmed(txId, messenger)),
  );

  const hash = transactionIds.length
    ? getTransaction(transactionIds.slice(-1)[0], messenger)?.hash
    : undefined;

  return await waitForAcrossCompletion(
    quote.original,
    hash as Hex | undefined,
    messenger,
  );
}

type AcrossStatusResponse = {
  status?: string;
  destinationTxHash?: Hex;
  fillTxHash?: Hex;
  txHash?: Hex;
};

async function waitForAcrossCompletion(
  quote: AcrossQuote,
  transactionHash: Hex | undefined,
  messenger: TransactionPayControllerMessenger,
): Promise<Hex | undefined> {
  if (!transactionHash || !quote.quote.id) {
    return transactionHash;
  }

  const config = getPayStrategiesConfig(messenger);
  const params = new URLSearchParams({
    depositId: quote.quote.id,
    originChainId: String(quote.quote.swapTx.chainId),
    txHash: transactionHash,
  });
  const url = `${config.across.apiBase}/deposit/status?${params.toString()}`;

  let attempt = 0;

  while (true) {
    attempt += 1;
    let status: AcrossStatusResponse;

    try {
      const response = await successfulFetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      status = (await response.json()) as AcrossStatusResponse;
    } catch (error) {
      log('Across status polling request failed', {
        attempt,
        error: String(error),
        transactionHash,
      });

      await new Promise((resolve) =>
        setTimeout(resolve, ACROSS_STATUS_POLL_INTERVAL),
      );
      continue;
    }

    const normalizedStatus = status.status?.toLowerCase();

    log('Polled Across status', {
      attempt,
      status: normalizedStatus,
      transactionHash,
    });

    if (
      normalizedStatus &&
      ['completed', 'filled', 'success'].includes(normalizedStatus)
    ) {
      return (
        status.destinationTxHash ??
        status.fillTxHash ??
        status.txHash ??
        transactionHash
      );
    }

    if (
      normalizedStatus &&
      ['error', 'failed', 'refund', 'refunded'].includes(normalizedStatus)
    ) {
      throw new Error(`Across request failed with status: ${normalizedStatus}`);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, ACROSS_STATUS_POLL_INTERVAL),
    );
  }
}

function getAcrossDepositType(
  transactionType?: TransactionType,
): TransactionType {
  switch (transactionType) {
    case TransactionType.perpsDeposit:
      return TransactionType.perpsAcrossDeposit;
    case TransactionType.predictDeposit:
      return TransactionType.predictAcrossDeposit;
    case undefined:
      return TransactionType.perpsAcrossDeposit;
    default:
      return transactionType;
  }
}

function buildTransactionParams(
  from: Hex,
  params: {
    chainId: number;
    data: Hex;
    gasLimit?: number;
    to: Hex;
    value?: Hex;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  },
): TransactionParams {
  const value = toHex(params.value ?? '0x0');

  return {
    data: params.data,
    from,
    gas: params.gasLimit === undefined ? undefined : toHex(params.gasLimit),
    maxFeePerGas: normalizeOptionalHex(params.maxFeePerGas),
    maxPriorityFeePerGas: normalizeOptionalHex(params.maxPriorityFeePerGas),
    to: params.to,
    value,
  };
}

function normalizeOptionalHex(value?: string): Hex | undefined {
  if (value === undefined) {
    return undefined;
  }

  return toHex(value);
}

function toBatchTransactionParams(
  params: TransactionParams,
): BatchTransactionParams {
  return {
    data: params.data as Hex | undefined,
    gas: params.gas as Hex | undefined,
    maxFeePerGas: params.maxFeePerGas as Hex | undefined,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
    to: params.to as Hex | undefined,
    value: params.value as Hex | undefined,
  };
}
