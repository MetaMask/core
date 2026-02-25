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

import type { AcrossQuote } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { estimateGasLimitWithBufferOrFallback } from '../../utils/gas';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

const log = createModuleLogger(projectLogger, 'across-strategy');
const ACROSS_STATUS_POLL_INTERVAL = 3000;
const ACROSS_STATUS_MAX_ATTEMPTS = 20;

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
  const { approvalTxns, swapTx } = quote.original.quote;
  const quoteGasLimits = quote.original.gasLimits;
  const { from } = quote.request;
  const chainId = toHex(swapTx.chainId);

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  const transactions: PreparedAcrossTransaction[] = [];

  if (approvalTxns?.length) {
    for (const [index, approval] of approvalTxns.entries()) {
      transactions.push({
        params: await buildTransactionParams(messenger, from, {
          chainId: approval.chainId,
          data: approval.data,
          gasLimit: quoteGasLimits?.approval[index]?.estimate,
          to: approval.to,
          value: approval.value,
        }),
        type: TransactionType.tokenMethodApprove,
      });
    }
  }

  transactions.push({
    params: await buildTransactionParams(messenger, from, {
      chainId: swapTx.chainId,
      data: swapTx.data,
      gasLimit: quoteGasLimits?.swap?.estimate,
      to: swapTx.to,
      value: swapTx.value,
      maxFeePerGas: swapTx.maxFeePerGas,
      maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
    }),
    type: acrossDepositType,
  });

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
        from,
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

  for (let attempt = 0; attempt < ACROSS_STATUS_MAX_ATTEMPTS; attempt++) {
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
        attempt: attempt + 1,
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
      attempt: attempt + 1,
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

  log('Across status polling timed out', { transactionHash });
  return transactionHash;
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

async function buildTransactionParams(
  messenger: TransactionPayControllerMessenger,
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
): Promise<TransactionParams> {
  const chainId = toHex(params.chainId);
  const value = toHex(params.value ?? '0x0');
  const gas =
    params.gasLimit ??
    (await estimateGasLimit(
      messenger,
      {
        chainId,
        data: params.data,
        to: params.to,
        value,
      },
      from,
    ));

  return {
    data: params.data,
    from,
    gas: toHex(gas),
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

async function estimateGasLimit(
  messenger: TransactionPayControllerMessenger,
  params: {
    chainId: Hex;
    data: Hex;
    to: Hex;
    value: Hex;
  },
  from: Hex,
): Promise<number> {
  const { chainId, data, to, value } = params;
  const gasResult = await estimateGasLimitWithBufferOrFallback({
    chainId,
    data,
    fallbackOnSimulationFailure: true,
    from,
    messenger,
    to,
    value,
  });

  if (gasResult.usedFallback) {
    log('Gas estimate failed, using fallback', { error: gasResult.error });
  }

  return gasResult.estimate;
}
