import { toHex } from '@metamask/controller-utils';
import type { BatchTransactionParams } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import { getGasBuffer } from './feature-flags';
import { estimateGasLimit } from './gas';

const log = createModuleLogger(projectLogger, 'quote-gas');

export type QuoteGasTransaction = {
  chainId: Hex;
  data: Hex;
  from: Hex;
  gas?: number | string;
  to: Hex;
  value?: number | string | Hex;
};

export type QuoteGasLimit = {
  estimate: number;
  max: number;
};

export async function estimateQuoteGasLimits({
  fallbackGas,
  fallbackOnSimulationFailure = false,
  messenger,
  transactions,
}: {
  fallbackGas?: {
    estimate: number;
    max: number;
  };
  fallbackOnSimulationFailure?: boolean;
  messenger: TransactionPayControllerMessenger;
  transactions: QuoteGasTransaction[];
}): Promise<{
  batchGasLimit?: QuoteGasLimit;
  gasLimits: QuoteGasLimit[];
  is7702: boolean;
  totalGasEstimate: number;
  totalGasLimit: number;
  usedBatch: boolean;
}> {
  if (transactions.length === 0) {
    throw new Error('Quote gas estimation requires at least one transaction');
  }

  const useBatch = transactions.length > 1;

  if (useBatch) {
    return {
      ...(await estimateQuoteGasLimitsBatch(transactions, messenger)),
      usedBatch: true,
    };
  }

  return {
    ...(await estimateQuoteGasLimitSingle({
      fallbackGas,
      fallbackOnSimulationFailure,
      messenger,
      transaction: transactions[0],
    })),
    is7702: false,
    usedBatch: false,
  };
}

async function estimateQuoteGasLimitsBatch(
  transactions: QuoteGasTransaction[],
  messenger: TransactionPayControllerMessenger,
): Promise<{
  batchGasLimit?: QuoteGasLimit;
  gasLimits: QuoteGasLimit[];
  is7702: boolean;
  totalGasEstimate: number;
  totalGasLimit: number;
}> {
  const [firstTransaction] = transactions;
  const gasBuffer = getGasBuffer(messenger, firstTransaction.chainId);

  const paramGasLimits = transactions.map((transaction) =>
    parseGasLimit(transaction.gas),
  );

  const { gasLimits } = await messenger.call(
    'TransactionController:estimateGasBatch',
    {
      chainId: firstTransaction.chainId,
      from: firstTransaction.from,
      transactions: transactions.map(toBatchTransactionParams),
    },
  );

  if (gasLimits.length !== 1 && gasLimits.length !== transactions.length) {
    throw new Error('Unexpected batch gas limit count');
  }

  const bufferedGasLimits = gasLimits.map((gasLimit, index) => {
    const providedGasLimit = paramGasLimits[index];
    const providedGasWasPreserved =
      providedGasLimit !== undefined && providedGasLimit === gasLimit;

    // Per-entry batch results currently preserve validated input gas values
    // for transactions that already provided gas. If that contract changes
    // and batch estimation returns a different value, treat it as a fresh
    // estimate and apply the buffer. A single combined 7702 result is always
    // buffered because it is a fresh batch estimate.
    const useBuffer = gasLimits.length === 1 || !providedGasWasPreserved;
    const bufferedGas = Math.ceil(gasLimit * (useBuffer ? gasBuffer : 1));

    return {
      estimate: bufferedGas,
      max: bufferedGas,
    };
  });

  const totalGasLimit = bufferedGasLimits.reduce(
    (acc, gasLimit) => acc + gasLimit.max,
    0,
  );
  const is7702 = bufferedGasLimits.length === 1;
  const batchGasLimit = is7702 ? bufferedGasLimits[0] : undefined;

  return {
    ...(batchGasLimit ? { batchGasLimit } : {}),
    gasLimits: bufferedGasLimits,
    is7702,
    totalGasEstimate: totalGasLimit,
    totalGasLimit,
  };
}

async function estimateQuoteGasLimitSingle({
  fallbackGas,
  fallbackOnSimulationFailure,
  messenger,
  transaction,
}: {
  fallbackGas?: {
    estimate: number;
    max: number;
  };
  fallbackOnSimulationFailure: boolean;
  messenger: TransactionPayControllerMessenger;
  transaction: QuoteGasTransaction;
}): Promise<{
  gasLimits: QuoteGasLimit[];
  totalGasEstimate: number;
  totalGasLimit: number;
}> {
  const providedGasLimit = parseGasLimit(transaction.gas);

  if (providedGasLimit !== undefined) {
    log('Using provided gas limit', {
      chainId: transaction.chainId,
      gas: providedGasLimit,
      index: 0,
      to: transaction.to,
    });

    return {
      gasLimits: [
        {
          estimate: providedGasLimit,
          max: providedGasLimit,
        },
      ],
      totalGasEstimate: providedGasLimit,
      totalGasLimit: providedGasLimit,
    };
  }

  const gasLimitResult = await estimateGasLimit({
    chainId: transaction.chainId,
    data: transaction.data,
    fallbackGas,
    fallbackOnSimulationFailure,
    from: transaction.from,
    messenger,
    to: transaction.to,
    value: toHex(transaction.value ?? '0'),
  });

  if (gasLimitResult.usedFallback) {
    log('Gas estimate failed, using fallback', {
      chainId: transaction.chainId,
      error: gasLimitResult.error,
      index: 0,
      to: transaction.to,
    });
  }

  const gasLimit = {
    estimate: gasLimitResult.estimate,
    max: gasLimitResult.max,
  };

  return {
    gasLimits: [gasLimit],
    totalGasEstimate: gasLimit.estimate,
    totalGasLimit: gasLimit.max,
  };
}

function toBatchTransactionParams(
  transaction: QuoteGasTransaction,
): BatchTransactionParams {
  return {
    data: transaction.data,
    gas: transaction.gas === undefined ? undefined : toHex(transaction.gas),
    maxFeePerGas: undefined,
    maxPriorityFeePerGas: undefined,
    to: transaction.to,
    value: toHex(transaction.value ?? '0'),
  };
}

function parseGasLimit(gas?: number | string): number | undefined {
  if (gas === undefined) {
    return undefined;
  }

  const parsedGas = new BigNumber(gas);

  if (
    !parsedGas.isFinite() ||
    parsedGas.isNaN() ||
    !parsedGas.isInteger() ||
    parsedGas.lte(0)
  ) {
    return undefined;
  }

  return parsedGas.toNumber();
}
