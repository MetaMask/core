import { toHex } from '@metamask/controller-utils';
import type {
  BatchTransactionParams,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionPayControllerMessenger } from '../index.js';
import { projectLogger } from '../logger.js';
import type { QuoteRequest } from '../types.js';
import { getFeatureFlags, getGasBuffer } from './feature-flags.js';
import { estimateGasLimit } from './gas.js';

const log = createModuleLogger(projectLogger, 'quote-gas');

// Hardcoded gas allowance for the prepended payment override transaction(s).
const PAYMENT_OVERRIDE_GAS = 75_000;

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

/** Gas required on the source chain, including any prepended transactions. */
export type SourceGas = {
  gasLimits: number[];
  is7702: boolean;
  totalGasEstimate: number;
  totalGasLimit: number;
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
  requiresAuthorizationList?: true;
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

/**
 * Estimate the source-chain gas for a quote's transactions, including the
 * transactions prepended at submit time.
 *
 * Post-quote flows prepend the original transaction, so it is estimated with
 * the quote transactions to let batch estimation detect EIP-7702 support.
 * Without it a single quote step is estimated alone, gets `is7702: false`, and
 * the batch falls back to separate transactions that each need native gas.
 * When the original transaction cannot be estimated, fixed allowances for the
 * prepended transactions are added instead.
 *
 * @param options - Options bag.
 * @param options.fromOverride - Address to estimate from instead of each
 * transaction's own `from`, such as the Predict Safe holding the source token.
 * @param options.messenger - Controller messenger.
 * @param options.request - Quote request.
 * @param options.transaction - Original transaction metadata.
 * @param options.transactions - Quote transactions to estimate.
 * @returns Source gas, with separate limits in submission order.
 */
export async function estimateSourceGas({
  fromOverride,
  messenger,
  request,
  transaction,
  transactions,
}: {
  fromOverride?: Hex;
  messenger: TransactionPayControllerMessenger;
  request: QuoteRequest;
  transaction: TransactionMeta;
  transactions: QuoteGasTransaction[];
}): Promise<SourceGas> {
  const originalTransaction = getOriginalTransactionGas(request, transaction);

  const allTransactions = (
    originalTransaction ? [originalTransaction, ...transactions] : transactions
  ).map((singleTransaction) =>
    fromOverride
      ? { ...singleTransaction, from: fromOverride, gas: undefined }
      : singleTransaction,
  );

  const result = await estimateQuoteGasLimits({
    fallbackGas: getFeatureFlags(messenger).relayFallbackGas,
    fallbackOnSimulationFailure: true,
    messenger,
    transactions: allTransactions,
  });

  const gas = {
    gasLimits: result.gasLimits.map((gasLimit) => gasLimit.max),
    is7702: result.is7702,
    totalGasEstimate: result.totalGasEstimate,
    totalGasLimit: result.totalGasLimit,
  };

  return originalTransaction ? gas : addPrependedGas(gas, request, transaction);
}

async function estimateQuoteGasLimitsBatch(
  transactions: QuoteGasTransaction[],
  messenger: TransactionPayControllerMessenger,
): Promise<{
  batchGasLimit?: QuoteGasLimit;
  gasLimits: QuoteGasLimit[];
  is7702: boolean;
  requiresAuthorizationList?: true;
  totalGasEstimate: number;
  totalGasLimit: number;
}> {
  const [firstTransaction] = transactions;
  const gasBuffer = getGasBuffer(messenger, firstTransaction.chainId);

  const paramGasLimits = transactions.map((transaction) =>
    parseGasLimit(transaction.gas),
  );

  const { gasLimits, mode, requiresAuthorizationList } = await messenger.call(
    'TransactionController:estimateGasBatch',
    {
      chainId: firstTransaction.chainId,
      from: firstTransaction.from,
      transactions: transactions.map(toBatchTransactionParams),
    },
  );

  // Older TransactionController versions return no `mode`, so detect a
  // combined EIP-7702 gas limit from the number of gas limits instead.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const is7702 =
    mode === undefined ? gasLimits.length === 1 : mode === 'eip7702';

  const expectedGasLimitCount = is7702 ? 1 : transactions.length;

  if (gasLimits.length !== expectedGasLimitCount) {
    throw new Error('Unexpected batch gas limit count');
  }

  const bufferedGasLimits = gasLimits.map((gasLimit, index) => {
    const providedGasLimit = paramGasLimits[index];
    const providedGasWasPreserved =
      providedGasLimit !== undefined && providedGasLimit === gasLimit;

    // Per-entry batch results currently preserve validated input gas values
    // for transactions that already provided gas. If that contract changes
    // and batch estimation returns a different value, treat it as a fresh
    // estimate and apply the buffer. A combined 7702 result is always
    // buffered because it is a fresh batch estimate.
    const useBuffer = is7702 || !providedGasWasPreserved;
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
  const batchGasLimit = is7702 ? bufferedGasLimits[0] : undefined;

  return {
    ...(batchGasLimit ? { batchGasLimit } : {}),
    gasLimits: bufferedGasLimits,
    is7702,
    ...(requiresAuthorizationList ? { requiresAuthorizationList } : {}),
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

function getOriginalTransactionGas(
  request: QuoteRequest,
  transaction: TransactionMeta,
): QuoteGasTransaction | undefined {
  const { txParams } = transaction;
  const to = txParams.to as Hex | undefined;

  if (!request.isPostQuote || !to || hasAccountOverride(request, transaction)) {
    return undefined;
  }

  const gas = getOriginalGas(transaction);

  return {
    chainId: transaction.chainId,
    data: (txParams.data as Hex) ?? '0x',
    from: txParams.from as Hex,
    gas: gas ? String(gas) : undefined,
    to,
    value: txParams.value ?? '0',
  };
}

function addPrependedGas(
  gas: SourceGas,
  request: QuoteRequest,
  transaction: TransactionMeta,
): SourceGas {
  const originalGas = request.isPostQuote
    ? getOriginalGas(transaction)
    : undefined;

  const withOriginal = originalGas
    ? prependGas(gas, new BigNumber(originalGas).toNumber())
    : gas;

  return request.paymentOverride
    ? prependGas(withOriginal, PAYMENT_OVERRIDE_GAS)
    : withOriginal;
}

function prependGas(gas: SourceGas, prependedGas: number): SourceGas {
  // A combined 7702 limit stays a single limit, otherwise the prepended
  // transaction gets its own limit ahead of the quote transactions.
  const gasLimits = gas.is7702
    ? [gas.gasLimits[0] + prependedGas]
    : [prependedGas, ...gas.gasLimits];

  log('Added prepended transaction gas', { gasLimits, prependedGas });

  return {
    gasLimits,
    is7702: gas.is7702,
    totalGasEstimate: gas.totalGasEstimate + prependedGas,
    totalGasLimit: gas.totalGasLimit + prependedGas,
  };
}

// Prefer the caller-provided nested gas, since the transaction controller may
// re-estimate `txParams.gas` during batch creation.
function getOriginalGas(transaction: TransactionMeta): string | undefined {
  return (
    transaction.nestedTransactions?.find((nested) => nested.gas)?.gas ??
    transaction.txParams.gas
  );
}

function hasAccountOverride(
  request: QuoteRequest,
  transaction: TransactionMeta,
): boolean {
  return (
    request.from.toLowerCase() !==
    (transaction.txParams.from as Hex).toLowerCase()
  );
}
