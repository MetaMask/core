import { toHex } from '@metamask/controller-utils';
import type { BatchTransactionParams } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getGasBuffer, isEIP7702Chain } from './feature-flags';
import { estimateGasLimit } from './gas';
import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';

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
  source: 'batch' | 'estimated' | 'fallback' | 'provided';
  error?: unknown;
};

export async function estimateQuoteGasLimits({
  allowBatch = true,
  fallbackGas,
  fallbackOnSimulationFailure = false,
  messenger,
  transactions,
}: {
  allowBatch?: boolean;
  fallbackGas?: {
    estimate: number;
    max: number;
  };
  fallbackOnSimulationFailure?: boolean;
  messenger: TransactionPayControllerMessenger;
  transactions: QuoteGasTransaction[];
}): Promise<{
  gasLimits: QuoteGasLimit[];
  totalGasEstimate: number;
  totalGasLimit: number;
  usedBatch: boolean;
}> {
  if (transactions.length === 0) {
    return {
      gasLimits: [],
      totalGasEstimate: 0,
      totalGasLimit: 0,
      usedBatch: false,
    };
  }

  const [firstTransaction] = transactions;
  const useBatch =
    allowBatch &&
    transactions.length > 1 &&
    hasUniformBatchContext(transactions) &&
    isEIP7702Chain(messenger, firstTransaction.chainId);

  if (useBatch) {
    try {
      return {
        ...(await estimateQuoteGasLimitsBatch(transactions, messenger)),
        usedBatch: true,
      };
    } catch (error) {
      log('Batch gas estimation failed, falling back to per-transaction path', {
        chainId: firstTransaction.chainId,
        error,
      });
    }
  }

  return {
    ...(await estimateQuoteGasLimitsIndividually({
      fallbackGas,
      fallbackOnSimulationFailure,
      messenger,
      transactions,
    })),
    usedBatch: false,
  };
}

async function estimateQuoteGasLimitsBatch(
  transactions: QuoteGasTransaction[],
  messenger: TransactionPayControllerMessenger,
): Promise<{
  gasLimits: QuoteGasLimit[];
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
      source: 'batch',
    } as QuoteGasLimit;
  });

  const totalGasLimit = bufferedGasLimits.reduce(
    (acc, gasLimit) => acc + gasLimit.max,
    0,
  );

  return {
    gasLimits: bufferedGasLimits,
    totalGasEstimate: totalGasLimit,
    totalGasLimit,
  };
}

async function estimateQuoteGasLimitsIndividually({
  fallbackGas,
  fallbackOnSimulationFailure,
  messenger,
  transactions,
}: {
  fallbackGas?: {
    estimate: number;
    max: number;
  };
  fallbackOnSimulationFailure: boolean;
  messenger: TransactionPayControllerMessenger;
  transactions: QuoteGasTransaction[];
}): Promise<{
  gasLimits: QuoteGasLimit[];
  totalGasEstimate: number;
  totalGasLimit: number;
}> {
  const gasLimits = await Promise.all(
    transactions.map(async (transaction) => {
      const providedGasLimit = parseGasLimit(transaction.gas);

      if (providedGasLimit !== undefined) {
        return {
          estimate: providedGasLimit,
          max: providedGasLimit,
          source: 'provided',
        } as QuoteGasLimit;
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

      const gasEstimate: QuoteGasLimit = {
        estimate: gasLimitResult.estimate,
        max: gasLimitResult.max,
        source: gasLimitResult.usedFallback ? 'fallback' : 'estimated',
      };

      if (gasLimitResult.error === undefined) {
        return gasEstimate;
      }

      return {
        ...gasEstimate,
        error: gasLimitResult.error,
      };
    }),
  );

  return {
    gasLimits,
    totalGasEstimate: gasLimits.reduce(
      (acc, gasLimit) => acc + gasLimit.estimate,
      0,
    ),
    totalGasLimit: gasLimits.reduce((acc, gasLimit) => acc + gasLimit.max, 0),
  };
}

function hasUniformBatchContext(transactions: QuoteGasTransaction[]): boolean {
  const [firstTransaction] = transactions;

  return transactions.every(
    (transaction) =>
      transaction.chainId.toLowerCase() ===
        firstTransaction.chainId.toLowerCase() &&
      transaction.from.toLowerCase() === firstTransaction.from.toLowerCase(),
  );
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

  let parsedGas: BigNumber;

  if (typeof gas === 'number') {
    parsedGas = new BigNumber(gas);
  } else if (gas.startsWith('0x')) {
    parsedGas = new BigNumber(gas.slice(2), 16);
  } else {
    parsedGas = new BigNumber(gas);
  }

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
