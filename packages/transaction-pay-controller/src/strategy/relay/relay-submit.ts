import { ORIGIN_METAMASK, toHex } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionParams } from '@metamask/transaction-controller';
import type {
  AuthorizationList,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { RELAY_DEPOSIT_TYPES, RELAY_POLLING_INTERVAL } from './constants';
import { getRelayStatus, submitRelayExecute } from './relay-api';
import type {
  RelayExecuteRequest,
  RelayQuote,
  RelayStatusResponse,
} from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  getFeatureFlags,
  isEIP7702Chain,
  isRelayExecuteEnabled,
} from '../../utils/feature-flags';
import {
  getLiveTokenBalance,
  normalizeTokenAddress,
  TokenAddressTarget,
} from '../../utils/token';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

const FALLBACK_HASH = '0x0' as Hex;

const log = createModuleLogger(projectLogger, 'relay-strategy');

/**
 * Submits Relay quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitRelayQuotes(
  request: PayStrategyExecuteRequest<RelayQuote>,
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

/**
 * Executes a single Relay quote.
 *
 * @param quote - Relay quote to execute.
 * @param messenger - Controller messenger.
 * @param transaction - Original transaction meta.
 * @returns An object containing the transaction hash if available.
 */
async function executeSingleQuote(
  quote: TransactionPayQuote<RelayQuote>,
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

  await submitTransactions(quote, transaction, messenger);

  const targetHash = await waitForRelayCompletion(
    quote.original,
    (sourceHash) => {
      log('Source hash received', sourceHash);

      updateTransaction(
        {
          transactionId: transaction.id,
          messenger,
          note: 'Add source hash from Relay status',
        },
        (tx) => {
          tx.metamaskPay ??= {};
          tx.metamaskPay.sourceHash = sourceHash;
        },
      );
    },
  );

  log('Relay request completed', targetHash);

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Intent complete after Relay completion',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );

  return { transactionHash: targetHash };
}

/**
 * Wait for a Relay request to complete.
 *
 * @param quote - Relay quote associated with the request.
 * @param onSourceHash - Called with the source tx hash as soon as it appears.
 * @returns A promise that resolves when the Relay request is complete.
 */
async function waitForRelayCompletion(
  quote: RelayQuote,
  onSourceHash?: (hash: Hex) => void,
): Promise<Hex> {
  const isSameChain =
    quote.details.currencyIn.currency.chainId ===
    quote.details.currencyOut.currency.chainId;

  const isSingleDepositStep =
    quote.steps.length === 1 && quote.steps[0].id === 'deposit';

  if (isSameChain && !isSingleDepositStep) {
    log('Skipping polling as same chain');
    return FALLBACK_HASH;
  }

  const { requestId } = quote.steps[0];
  let sourceHashEmitted = false;

  while (true) {
    const status: RelayStatusResponse = await getRelayStatus(requestId);

    log('Polled status', status.status, status);

    if (!sourceHashEmitted && status.inTxHashes?.length) {
      sourceHashEmitted = true;
      onSourceHash?.(status.inTxHashes[0] as Hex);
    }

    if (status.status === 'success') {
      const targetHash =
        (status.txHashes?.slice(-1)[0] as Hex) ?? FALLBACK_HASH;
      return targetHash;
    }

    if (['failure', 'refund', 'refunded'].includes(status.status)) {
      throw new Error(`Relay request failed with status: ${status.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, RELAY_POLLING_INTERVAL));
  }
}

/**
 * Normalize the parameters from a relay quote step to match TransactionParams.
 *
 * @param params - Parameters from a relay quote step.
 * @param messenger - Controller messenger.
 * @returns Normalized transaction parameters.
 */
function normalizeParams(
  params: RelayQuote['steps'][0]['items'][0]['data'],
  messenger: TransactionPayControllerMessenger,
): TransactionParams {
  const featureFlags = getFeatureFlags(messenger);

  return {
    data: params.data,
    from: params.from,
    gas: toHex(params.gas ?? featureFlags.relayFallbackGas.max),
    maxFeePerGas: toHex(params.maxFeePerGas),
    maxPriorityFeePerGas: toHex(params.maxPriorityFeePerGas),
    to: params.to,
    value: toHex(params.value ?? '0'),
  };
}

/**
 * Validate the source token balance is sufficient for the relay deposit.
 *
 * Reads the live balance from TokenBalancesController and compares it against
 * the quote's required source amount to prevent submitting transactions that
 * will revert on-chain due to insufficient balance.
 *
 * @param quote - Relay quote containing the required source amount.
 * @param messenger - Controller messenger.
 */
async function validateSourceBalance(
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { from, sourceChainId, sourceTokenAddress } = quote.request;

  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  let currentBalance: string;

  try {
    currentBalance = await getLiveTokenBalance(
      messenger,
      from,
      sourceChainId,
      normalizedSourceTokenAddress,
    );
  } catch (error) {
    throw new Error(
      `Cannot validate payment token balance - ${(error as Error).message}`,
    );
  }

  const requiredAmount = new BigNumber(quote.sourceAmount.raw);
  const balance = new BigNumber(currentBalance);

  log('Validating source balance', {
    from,
    sourceChainId,
    sourceTokenAddress,
    currentBalance,
    requiredAmount: requiredAmount.toString(10),
  });

  if (balance.isLessThan(requiredAmount)) {
    throw new Error(
      `Insufficient source token balance for relay deposit. ` +
        `Required: ${requiredAmount.toString(10)}, ` +
        `Available: ${balance.toString(10)}`,
    );
  }
}

/**
 * Submit transactions for a relay quote.
 *
 * On EIP-7702 supported chains, combines the source calls via
 * getDelegationTransaction and submits through Relay's /execute endpoint
 * (gasless — Relay's relayer pays origin gas).
 *
 * On other chains, adds the transactions directly via the
 * TransactionController and waits for on-chain confirmation.
 *
 * @param quote - Relay quote.
 * @param transaction - Original transaction meta.
 * @param messenger - Controller messenger.
 * @returns Hash of the last submitted transaction.
 */
async function submitTransactions(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): Promise<Hex> {
  const { steps } = quote.original;
  const params = steps.flatMap((step) => step.items).map((item) => item.data);
  const invalidKind = steps.find((step) => step.kind !== 'transaction')?.kind;

  if (invalidKind) {
    throw new Error(`Unsupported step kind: ${invalidKind}`);
  }

  await validateSourceBalance(quote, messenger);

  const normalizedParams = params.map((singleParams) =>
    normalizeParams(singleParams, messenger),
  );

  // For post-quote flows, prepend the original transaction so it gets
  // included in the batch alongside the relay deposit(s).
  // This always results in multiple params, so it takes the batch path.
  const { isPostQuote } = quote.request;

  const allParams =
    isPostQuote && transaction.txParams.to
      ? [
          {
            data: transaction.txParams.data as Hex | undefined,
            from: transaction.txParams.from,
            to: transaction.txParams.to,
            value: transaction.txParams.value as Hex | undefined,
          } as TransactionParams,
          ...normalizedParams,
        ]
      : normalizedParams;

  const { sourceChainId } = quote.request;

  if (
    isRelayExecuteEnabled(messenger) &&
    isEIP7702Chain(messenger, sourceChainId)
  ) {
    return await submitViaRelayExecute(
      quote,
      transaction,
      messenger,
      allParams,
    );
  }

  return await submitViaTransactionController(
    quote,
    transaction,
    messenger,
    normalizedParams,
    allParams,
  );
}

/**
 * Submit source transactions via Relay's /execute endpoint.
 *
 * Combines all source calls (approve + deposit, and optionally the
 * original transaction for post-quote flows) into a single EIP-7702
 * delegation transaction using getDelegationTransaction, then submits
 * it to Relay's /execute endpoint for gasless execution.
 *
 * @param quote - Relay quote.
 * @param transaction - Original transaction meta.
 * @param messenger - Controller messenger.
 * @param allParams - All source transaction params to combine.
 * @returns Fallback hash (actual hash comes from relay status polling).
 */
async function submitViaRelayExecute(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  allParams: TransactionParams[],
): Promise<Hex> {
  const { from, sourceChainId } = quote.request;
  const { requestId } = quote.original.steps[0];

  const sourceCallTransaction = {
    ...transaction,
    chainId: sourceChainId,
    nestedTransactions: allParams.map((params) => ({
      data: (params.data ?? '0x') as Hex,
      to: params.to as Hex,
      value: (params.value ?? '0x0') as Hex,
    })),
  } as TransactionMeta;

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction: sourceCallTransaction },
  );

  log('Delegation result for source calls', delegation);

  const executeBody: RelayExecuteRequest = {
    executionKind: 'rawCalls',
    data: {
      chainId: Number(sourceChainId),
      to: delegation.to,
      data: delegation.data,
      value: String(Number(delegation.value)),
      ...(delegation.authorizationList?.length
        ? {
            authorizationList: delegation.authorizationList.map((auth) => ({
              chainId: Number(auth.chainId),
              address: auth.address,
              nonce: Number(auth.nonce),
              yParity: Number(auth.yParity),
              r: auth.r as Hex,
              s: auth.s as Hex,
            })),
          }
        : {}),
    },
    executionOptions: {
      subsidizeFees: false,
    },
    requestId,
  };

  log('Submitting via Relay /execute', { executeBody, from });

  const result = await submitRelayExecute(messenger, executeBody);

  log('Relay /execute response', result);

  return FALLBACK_HASH;
}

/**
 * Submit source transactions via the TransactionController.
 *
 * Uses addTransaction for single params or addTransactionBatch for
 * multiple params. Waits for all transactions to be confirmed on-chain.
 *
 * @param quote - Relay quote.
 * @param transaction - Original transaction meta.
 * @param messenger - Controller messenger.
 * @param normalizedParams - Normalized relay-only params (without prepended original tx).
 * @param allParams - All params including any prepended original tx for post-quote flows.
 * @returns Hash of the last submitted transaction.
 */
async function submitViaTransactionController(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  normalizedParams: TransactionParams[],
  allParams: TransactionParams[],
): Promise<Hex> {
  const transactionIds: string[] = [];
  const { from, sourceChainId, sourceTokenAddress } = quote.request;
  const { isPostQuote } = quote.request;

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    sourceChainId,
  );

  log('Adding transactions', {
    normalizedParams: allParams,
    sourceChainId,
    from,
    networkClientId,
  });

  const { end } = collectTransactionIds(
    sourceChainId,
    from,
    messenger,
    (transactionId) => {
      transactionIds.push(transactionId);

      updateTransaction(
        {
          transactionId: transaction.id,
          messenger,
          note: 'Add required transaction ID from Relay submission',
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
    ? sourceTokenAddress
    : undefined;

  const isSameChain =
    quote.original.details.currencyIn.currency.chainId ===
    quote.original.details.currencyOut.currency.chainId;

  const authorizationList: AuthorizationList | undefined =
    isSameChain && quote.original.request.authorizationList?.length
      ? quote.original.request.authorizationList.map((a) => ({
          address: a.address,
          chainId: toHex(a.chainId),
        }))
      : undefined;

  const { gasLimits } = quote.original.metamask;

  if (allParams.length === 1) {
    const transactionParams = {
      ...allParams[0],
      authorizationList,
      gas: toHex(gasLimits[0]),
    };

    result = await messenger.call(
      'TransactionController:addTransaction',
      transactionParams,
      {
        gasFeeToken,
        networkClientId,
        origin: ORIGIN_METAMASK,
        requireApproval: false,
        type: getRelayDepositType(transaction.type),
      },
    );
  } else {
    const gasLimit7702 =
      gasLimits.length === 1 && allParams.length > 1
        ? toHex(gasLimits[0])
        : undefined;

    const transactions = allParams.map((singleParams, index) => {
      const gasLimit = gasLimits[index];
      const gas =
        gasLimit === undefined || gasLimit7702 ? undefined : toHex(gasLimit);

      return {
        params: {
          data: singleParams.data as Hex,
          gas,
          maxFeePerGas: singleParams.maxFeePerGas as Hex,
          maxPriorityFeePerGas: singleParams.maxPriorityFeePerGas as Hex,
          to: singleParams.to as Hex,
          value: singleParams.value as Hex,
        },
        type: getTransactionType(
          isPostQuote,
          index,
          transaction.type,
          normalizedParams.length,
        ),
      };
    });

    await messenger.call('TransactionController:addTransactionBatch', {
      from,
      disable7702: !gasLimit7702,
      disableHook: Boolean(gasLimit7702),
      disableSequential: Boolean(gasLimit7702),
      gasFeeToken,
      gasLimit7702,
      networkClientId,
      origin: ORIGIN_METAMASK,
      overwriteUpgrade: true,
      requireApproval: false,
      transactions,
    });
  }

  end();

  log('Added transactions', transactionIds);

  if (result) {
    const txHash = await result.result;
    log('Submitted transaction', txHash);
  }

  await Promise.all(
    transactionIds.map((txId) => waitForTransactionConfirmed(txId, messenger)),
  );

  log('All transactions confirmed', transactionIds);

  const hash = getTransaction(transactionIds.slice(-1)[0], messenger)?.hash;

  return hash as Hex;
}

/**
 * Determine the transaction type for a given index in the batch.
 *
 * @param isPostQuote - Whether this is a post-quote flow.
 * @param index - Index of the transaction in the batch.
 * @param originalType - Type of the original transaction (used for post-quote index 0).
 * @param relayParamCount - Number of relay-only params (excludes prepended original tx).
 * @returns The transaction type.
 */
function getTransactionType(
  isPostQuote: boolean | undefined,
  index: number,
  originalType: TransactionMeta['type'],
  relayParamCount: number,
): TransactionMeta['type'] {
  // Post-quote index 0 is the original transaction
  if (isPostQuote && index === 0) {
    return originalType;
  }

  // Adjust index for post-quote flows where original tx is prepended
  const relayIndex = isPostQuote ? index - 1 : index;

  const depositType = getRelayDepositType(originalType);

  // Single relay step is always a deposit (no approval needed)
  if (relayParamCount === 1) {
    return depositType;
  }

  return relayIndex === 0 ? TransactionType.tokenMethodApprove : depositType;
}

/**
 * Get the relay deposit transaction type based on the parent transaction type.
 *
 * @param originalType - Type of the parent transaction.
 * @returns The mapped relay deposit type, or `relayDeposit` as a fallback.
 */
function getRelayDepositType(
  originalType: TransactionMeta['type'],
): TransactionType {
  return (
    (originalType && RELAY_DEPOSIT_TYPES[originalType]) ??
    TransactionType.relayDeposit
  );
}
