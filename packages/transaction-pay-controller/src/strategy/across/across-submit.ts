import { ORIGIN_METAMASK, toHex } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  BatchTransactionParams,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import type { AcrossQuote, AcrossSwapApprovalResponse } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { estimateGasWithBufferOrFallback } from '../../utils/gas';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

const log = createModuleLogger(projectLogger, 'across-strategy');

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
  const { from } = quote.request;
  const chainId = toHex(swapTx.chainId);

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  const transactions: PreparedAcrossTransaction[] = [];

  if (approvalTxns?.length) {
    for (const approval of approvalTxns) {
      transactions.push({
        params: await buildTransactionParams(messenger, from, {
          chainId: approval.chainId,
          data: approval.data,
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

  return hash as Hex | undefined;
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
    to: Hex;
    value?: Hex;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  },
): Promise<TransactionParams> {
  const chainId = toHex(params.chainId);
  const value = toHex(params.value ?? '0x0');

  const gas = await estimateGasWithBuffer(
    messenger,
    {
      chainId,
      data: params.data,
      to: params.to,
      value,
    },
    from,
  );

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

async function estimateGasWithBuffer(
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
  const gasResult = await estimateGasWithBufferOrFallback({
    chainId,
    data,
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

export function isAcrossQuote(
  quote: TransactionPayQuote<unknown>,
): quote is TransactionPayQuote<AcrossQuote> {
  return Boolean(
    quote &&
      typeof quote === 'object' &&
      quote.original &&
      typeof quote.original === 'object' &&
      'quote' in quote.original,
  );
}

export function getAcrossOriginalQuote(
  quote: TransactionPayQuote<AcrossQuote>,
): AcrossSwapApprovalResponse {
  return quote.original.quote;
}
