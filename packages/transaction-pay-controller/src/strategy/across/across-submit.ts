import {
  ORIGIN_METAMASK,
  successfulFetch,
  toHex,
} from '@metamask/controller-utils';
import {
  TransactionType,
  hasTransactionType,
} from '@metamask/transaction-controller';
import type {
  BatchTransactionParams,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger.js';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { accountSupports7702 } from '../../utils/7702.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getGasBuffer } from '../../utils/feature-flags.js';
import { getNetworkClientId } from '../../utils/provider.js';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction.js';
import {
  getAcrossOrderedTransactions,
  getOriginalTransactionGas,
} from './transactions.js';
import type { AcrossQuote } from './types.js';

const log = createModuleLogger(projectLogger, 'across-strategy');
const ACROSS_STATUS_POLL_INTERVAL = 1000;

type PreparedAcrossTransaction = {
  params: TransactionParams;
  type: TransactionMeta['type'];
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

  const acrossDepositType = getAcrossDepositType(transaction);
  const transactionHash = await submitTransactions(
    quote,
    transaction,
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
 * @param parentTransaction - Parent transaction.
 * @param acrossDepositType - Transaction type used for the swap/deposit step.
 * @param messenger - Controller messenger.
 * @returns Hash of the last submitted transaction, if available.
 */
async function submitTransactions(
  quote: TransactionPayQuote<AcrossQuote>,
  parentTransaction: TransactionMeta,
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
  const shouldPrependOriginalTransaction =
    quote.request.isPostQuote === true &&
    parentTransaction.txParams.to !== undefined;
  const hasPrependedOriginalGasLimit =
    shouldPrependOriginalTransaction &&
    !is7702 &&
    quoteGasLimits.length > orderedTransactions.length;
  const gasLimitOffset = hasPrependedOriginalGasLimit ? 1 : 0;
  const transactionCount =
    orderedTransactions.length + (shouldPrependOriginalTransaction ? 1 : 0);

  const networkClientId = getNetworkClientId(messenger, chainId);

  const is7702Batch = is7702 && transactionCount > 1;
  const canUseQuotedBatchGasLimit =
    is7702Batch &&
    (!shouldPrependOriginalTransaction ||
      hasOriginalTransactionGas(parentTransaction));
  const batchGasLimit = canUseQuotedBatchGasLimit
    ? quoteGasLimits[0]?.max
    : undefined;

  if (canUseQuotedBatchGasLimit && batchGasLimit === undefined) {
    throw new Error('Missing quote gas limit for Across 7702 batch');
  }

  const quotedGasLimit7702 =
    batchGasLimit === undefined ? undefined : toHex(batchGasLimit);
  const parentHasAuthorizationList = Boolean(
    parentTransaction.txParams.authorizationList?.length,
  );

  const shouldUseGasFeeToken7702Submit = shouldEstimate7702SubmitBatch(
    parentTransaction,
    quote,
  )
    ? accountSupports7702(messenger, from)
    : false;
  const shouldUse7702Submit = [
    Boolean(quotedGasLimit7702),
    is7702Batch,
    parentHasAuthorizationList,
    shouldUseGasFeeToken7702Submit,
  ].some(Boolean);

  const shouldEstimateGasLimit7702 = !quotedGasLimit7702 && shouldUse7702Submit;

  const estimatedGasLimit7702 = shouldEstimateGasLimit7702
    ? await estimateSubmitBatchGasLimit7702({
        chainId,
        from,
        messenger,
        orderedTransactions,
        parentTransaction,
        shouldPrependOriginalTransaction,
      })
    : undefined;

  const gasLimit7702 = quotedGasLimit7702 ?? estimatedGasLimit7702;
  const submitAs7702 = shouldUse7702Submit || Boolean(gasLimit7702);

  const acrossTransactions: PreparedAcrossTransaction[] =
    orderedTransactions.map((transaction, index) => {
      const gasLimit = submitAs7702
        ? undefined
        : quoteGasLimits[index + gasLimitOffset]?.max;

      if (gasLimit === undefined && !submitAs7702) {
        const quoteGasIndex = index + gasLimitOffset;
        const errorMessage =
          transaction.kind === 'approval'
            ? `Missing quote gas limit for Across approval transaction at index ${quoteGasIndex}`
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
    });
  const originalTransaction = shouldPrependOriginalTransaction
    ? [
        buildOriginalTransaction(
          parentTransaction,
          submitAs7702 || !hasPrependedOriginalGasLimit
            ? undefined
            : quoteGasLimits[0]?.max,
        ),
      ]
    : [];
  const transactions = [...originalTransaction, ...acrossTransactions];

  const transactionIds: string[] = [];

  const { end } = collectTransactionIds(
    chainId,
    from,
    messenger,
    (transactionId) => {
      transactionIds.push(transactionId);

      updateTransaction(
        {
          transactionId: parentTransaction.id,
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
  const gasFeeToken = quote.fees.isSourceGasFeeToken
    ? quote.request.sourceTokenAddress
    : undefined;
  const excludeNativeTokenForFee = gasFeeToken ? true : undefined;

  try {
    if (transactions.length === 1) {
      result = await messenger.call(
        'TransactionController:addTransaction',
        transactions[0].params,
        {
          excludeNativeTokenForFee,
          gasFeeToken,
          networkClientId,
          origin: ORIGIN_METAMASK,
          isInternal: true,
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
        disable7702: !submitAs7702,
        disableHook: submitAs7702,
        disableSequential: submitAs7702,
        excludeNativeTokenForFee,
        from,
        gasFeeToken,
        gasLimit7702,
        networkClientId,
        origin: ORIGIN_METAMASK,
        isInternal: true,
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

  return await waitForAcrossCompletion(hash as Hex | undefined, messenger);
}

type AcrossStatusResponse = {
  depositId?: number | string;
  depositTxnRef?: Hex;
  status?: string;
  destinationTxHash?: Hex;
  fillTxnRef?: Hex;
  fillTxHash?: Hex;
  txHash?: Hex;
};

/**
 * Poll Across until a submitted deposit reaches a terminal status.
 *
 * @param transactionHash - Source-chain deposit transaction hash.
 * @param messenger - Controller messenger.
 * @returns Destination/fill transaction hash when available, otherwise the source hash.
 */
async function waitForAcrossCompletion(
  transactionHash: Hex | undefined,
  messenger: TransactionPayControllerMessenger,
): Promise<Hex | undefined> {
  if (!transactionHash) {
    return transactionHash;
  }

  const config = getPayStrategiesConfig(messenger);
  const params = new URLSearchParams({
    depositTxnRef: transactionHash,
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
        status.fillTxnRef ??
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

/**
 * Check whether submit should estimate a 7702 batch gas limit.
 *
 * This is needed for Predict withdraw post-quote flows that pay source-chain
 * gas with the source token, because the final submit batch can differ from the
 * batch shape that Across quoted.
 *
 * @param parentTransaction - Original transaction metadata.
 * @param quote - Across quote selected for execution.
 * @returns Whether submit should try to estimate the final 7702 batch gas.
 */
function shouldEstimate7702SubmitBatch(
  parentTransaction: TransactionMeta,
  quote: TransactionPayQuote<AcrossQuote>,
): boolean {
  return (
    hasTransactionType(parentTransaction, [TransactionType.predictWithdraw]) &&
    quote.request.isPostQuote === true &&
    quote.fees.isSourceGasFeeToken === true
  );
}

/**
 * Estimate the 7702 batch gas limit for the actual submit payload.
 *
 * Quotes can contain a combined 7702 gas limit that only covered the Across
 * approval/swap legs. When submit prepends the original transaction, estimate
 * the final batch shape so the gas limit covers every submitted leg.
 *
 * @param args - Estimation arguments.
 * @param args.chainId - Source chain ID.
 * @param args.from - Sender address.
 * @param args.messenger - Controller messenger.
 * @param args.orderedTransactions - Across approval/swap legs in submission order.
 * @param args.parentTransaction - Original transaction that may be prepended.
 * @param args.shouldPrependOriginalTransaction - Whether to include the original transaction in the estimate.
 * @returns Hex gas limit, or `undefined` when estimation is unavailable.
 */
async function estimateSubmitBatchGasLimit7702({
  chainId,
  from,
  messenger,
  orderedTransactions,
  parentTransaction,
  shouldPrependOriginalTransaction,
}: {
  chainId: Hex;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  orderedTransactions: ReturnType<typeof getAcrossOrderedTransactions>;
  parentTransaction: TransactionMeta;
  shouldPrependOriginalTransaction: boolean;
}): Promise<Hex | undefined> {
  if (!accountSupports7702(messenger, from)) {
    return undefined;
  }

  const originalTransaction = shouldPrependOriginalTransaction
    ? [buildOriginalTransaction(parentTransaction)]
    : [];

  const acrossTransactions = orderedTransactions.map((transaction) => ({
    params: buildTransactionParams(from, {
      chainId: transaction.chainId,
      data: transaction.data,
      maxFeePerGas: transaction.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
      to: transaction.to,
      value: transaction.value,
    }),
    type: transaction.type,
  }));

  const transactions = [...originalTransaction, ...acrossTransactions];

  try {
    const result = await messenger.call(
      'TransactionController:estimateGasBatch',
      {
        chainId,
        from,
        transactions: transactions.map(({ params }) =>
          toBatchTransactionParams(params),
        ),
      },
    );

    if (result.gasLimits.length !== 1) {
      return undefined;
    }

    const gasLimit = Math.ceil(
      result.gasLimits[0] * getGasBuffer(messenger, chainId),
    );

    return toHex(gasLimit);
  } catch {
    return undefined;
  }
}

/**
 * Build the original parent transaction as a prepared batch leg.
 *
 * @param transaction - Original transaction metadata.
 * @param gasLimit - Optional gas limit to pin on the original leg.
 * @returns Prepared transaction params and transaction type for the original leg.
 */
function buildOriginalTransaction(
  transaction: TransactionMeta,
  gasLimit?: number,
): PreparedAcrossTransaction {
  return {
    params: {
      data: transaction.txParams.data,
      from: transaction.txParams.from,
      gas: gasLimit === undefined ? undefined : toHex(gasLimit),
      to: transaction.txParams.to,
      value: transaction.txParams.value,
    } as TransactionParams,
    type: getOriginalTransactionType(transaction),
  };
}

/**
 * Get the transaction type to use for the original batch leg.
 *
 * @param transaction - Original transaction metadata.
 * @returns `predictWithdraw` for Predict withdrawals; otherwise the original type.
 */
function getOriginalTransactionType(
  transaction: TransactionMeta,
): TransactionMeta['type'] {
  if (hasTransactionType(transaction, [TransactionType.predictWithdraw])) {
    return TransactionType.predictWithdraw;
  }

  return transaction.type;
}

/**
 * Check whether the original transaction already has a usable gas limit.
 *
 * @param transaction - Original transaction metadata.
 * @returns Whether the original or nested transaction gas is a positive integer.
 */
function hasOriginalTransactionGas(transaction: TransactionMeta): boolean {
  return getOriginalTransactionGas(transaction) !== undefined;
}

/**
 * Get the transaction type for the Across bridge/deposit leg.
 *
 * @param transaction - Original parent transaction.
 * @returns Across-specific transaction type for known flows, or the original type.
 */
function getAcrossDepositType(transaction: TransactionMeta): TransactionType {
  if (hasTransactionType(transaction, [TransactionType.predictWithdraw])) {
    return TransactionType.predictAcrossWithdraw;
  }

  switch (transaction.type) {
    case TransactionType.perpsDeposit:
      return TransactionType.perpsAcrossDeposit;
    case TransactionType.predictDeposit:
      return TransactionType.predictAcrossDeposit;
    case undefined:
      return TransactionType.perpsAcrossDeposit;
    default:
      return transaction.type as TransactionType;
  }
}

/**
 * Build TransactionController params for an Across approval or swap leg.
 *
 * @param from - Sender address.
 * @param params - Across transaction fields.
 * @param params.chainId - Source chain ID.
 * @param params.data - Transaction calldata.
 * @param params.gasLimit - Optional gas limit.
 * @param params.to - Recipient contract address.
 * @param params.value - Optional native value.
 * @param params.maxFeePerGas - Optional EIP-1559 max fee.
 * @param params.maxPriorityFeePerGas - Optional EIP-1559 priority fee.
 * @returns TransactionController params.
 */
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

/**
 * Normalize an optional numeric string or hex string into a hex value.
 *
 * @param value - Optional value to normalize.
 * @returns Hex value, or `undefined` when no value is provided.
 */
function normalizeOptionalHex(value?: string): Hex | undefined {
  if (value === undefined) {
    return undefined;
  }

  return toHex(value);
}

/**
 * Convert full TransactionController params into batch transaction params.
 *
 * @param params - Transaction params.
 * @returns Batch-compatible transaction params.
 */
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
