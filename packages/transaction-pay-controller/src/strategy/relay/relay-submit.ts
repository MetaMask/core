import { ORIGIN_METAMASK, toHex } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  AuthorizationList,
  BatchTransactionParams,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { prefixError } from '../../utils/error-prefix';
import {
  getFeatureFlags,
  getRelayPollingInterval,
  getRelayPollingTimeout,
} from '../../utils/feature-flags';
import { submitMoneyAccountVaultDeposit } from '../../utils/ma-vault-deposit';
import { getNetworkClientId } from '../../utils/provider';
import {
  getLiveTokenBalance,
  normalizeTokenAddress,
  TokenAddressTarget,
} from '../../utils/token';
import {
  collectTransactionIds,
  getTransaction,
  getTransferredAmountFromTxHash,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import {
  FALLBACK_HASH,
  RELAY_DEPOSIT_TYPES,
  RELAY_FAILURE_STATUSES,
  RELAY_PENDING_STATUSES,
} from './constants';
import { submitHyperliquidWithdraw } from './hyperliquid-withdraw';
import {
  sweepPolymarketDepositWallet,
  submitPolymarketWithdraw,
} from './polymarket/withdraw';
import { getRelayStatus } from './relay-api';
import { submitViaRelayExecute } from './relay-submit-execute';
import type {
  RelayCompletionOutcome,
  RelayQuote,
  RelayStatus,
  RelayStatusResponse,
  RelayTransactionStep,
} from './types';

const log = createModuleLogger(projectLogger, 'relay-strategy');
const RELAY_ERROR_PREFIX = 'Relay: ';

/**
 * Submits Relay quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitRelayQuotes(
  request: PayStrategyExecuteRequest<RelayQuote>,
): Promise<{ transactionHash?: Hex }> {
  try {
    return await submitRelayQuotesInternal(request);
  } catch (error) {
    throw prefixError(error, RELAY_ERROR_PREFIX);
  }
}

async function submitRelayQuotesInternal(
  request: PayStrategyExecuteRequest<RelayQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing quotes', request);

  const { quotes, messenger, transaction } = request;

  if (!quotes.length) {
    throw new Error('No quotes to submit');
  }

  let transactionHash: Hex | undefined;

  for (const quote of quotes) {
    ({ transactionHash } = await executeSingleQuote(
      quote,
      messenger,
      transaction,
    ));
  }

  /* istanbul ignore if: concrete Relay submit paths return a hash/fallback or throw. */
  if (transactionHash === undefined) {
    throw new Error('Missing transaction hash');
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

  const isPolymarket = Boolean(quote.request.isPolymarketDepositWallet);

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

  let polymarketPreSubmitUsdceBalance = 0n;

  // Shallow clone so the server-returned requestId can be written back (state is frozen by Immer).
  const mutableOriginal: RelayQuote = { ...quote.original };

  if (quote.request.isHyperliquidSource) {
    await submitHyperliquidWithdraw(quote, quote.request.from, messenger);
  } else if (isPolymarket) {
    const { sourceHash, preSubmitUsdceBalance } =
      await submitPolymarketWithdraw(quote, quote.request.from, messenger);
    polymarketPreSubmitUsdceBalance = preSubmitUsdceBalance;
    setRelaySourceHash(transaction, messenger, sourceHash);
  } else {
    await submitTransactions(
      { ...quote, original: mutableOriginal },
      transaction,
      messenger,
    );
  }

  const completion = await waitForRelayCompletion(mutableOriginal, messenger, {
    onSourceHash: (hash) => {
      log('Source hash received', hash);
      setRelaySourceHash(transaction, messenger, hash);
    },
    tolerateFailure: isPolymarket,
  });

  log('Relay request completed', completion);

  if (isPolymarket) {
    await sweepPolymarketDepositWallet(quote.request.from, messenger, {
      relayStatus: completion.status,
      preSubmitUsdceBalance: polymarketPreSubmitUsdceBalance,
    });

    if (completion.status !== 'success') {
      throw new Error(`Request failed with status: ${completion.status}`);
    }
  }

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

  // Non-atomic flow: the quote bridged funds to `recipient` without embedding
  // the second leg. Now that Relay has settled, resolve the settled amount from
  // the on-chain Transfer log and submit the second-leg batch (approve + vault
  // deposit) sponsored from `recipient`.
  if (quote.request.atomic === false && completion.status === 'success') {
    const { transactionHash } = await submitPostCompletionBatch({
      completion,
      messenger,
      quote,
      transaction,
    });

    return { transactionHash: transactionHash ?? completion.targetHash };
  }

  return { transactionHash: completion.targetHash };
}

/**
 * Runs the second leg of a non-atomic Relay quote. Resolves the settled amount
 * from the on-chain Transfer log at `completion.targetHash`, then submits the
 * post-completion batch via `submitMoneyAccountVaultDeposit`. Post-quote flows
 * fetch pre-built calls via the client `getPaymentOverrideData` callback;
 * non-post-quote flows fall through to the transaction's own nested calls
 * re-encoded via `getAmountData`.
 *
 * @param options - Submit options.
 * @param options.completion - Outcome of `waitForRelayCompletion`.
 * @param options.messenger - Controller messenger.
 * @param options.quote - The Relay quote that was submitted.
 * @param options.transaction - Original transaction meta.
 * @returns Hash of the final submitted child transaction, if available.
 */
async function submitPostCompletionBatch({
  completion,
  messenger,
  quote,
  transaction,
}: {
  completion: RelayCompletionOutcome;
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<{ transactionHash?: Hex }> {
  const sourceAmountRaw = await resolveSettledAmount({
    completion,
    messenger,
    quote,
  });

  const recipient = quote.request.recipient ?? quote.request.from;

  const depositCalls: BatchTransactionParams[] | undefined = quote.request
    .isPostQuote
    ? await buildPostQuoteDepositCalls({
        messenger,
        sourceAmountRaw,
        transaction,
        quote,
      })
    : undefined;

  return submitMoneyAccountVaultDeposit({
    messenger,
    moneyAccountAddress: recipient,
    depositCalls,
    sourceAmountRaw,
    transaction,
    vaultDisabled: false,
  });
}

/**
 * Builds the post-completion batch for a post-quote flow whose parent
 * transaction carries no vault calls. Delegates to the client
 * `getPaymentOverrideData` callback with the settled amount.
 *
 * The callback MUST return a non-empty batch. Post-quote parent metas (e.g.
 * Perps/Predict withdraws) carry no vault-side nested calls, so falling back
 * to `getAmountData` in `resolveVaultDepositBatch` cannot recover the second
 * leg once Relay has already settled funds to the recipient. Throw eagerly so
 * the failure surfaces at the correct call site with an actionable message.
 *
 * @param options - Build options.
 * @param options.messenger - Controller messenger.
 * @param options.quote - The Relay quote that was submitted.
 * @param options.sourceAmountRaw - Settled amount in raw units.
 * @param options.transaction - Original transaction meta.
 * @returns The batch calls.
 * @throws If the callback returns an empty batch.
 */
async function buildPostQuoteDepositCalls({
  messenger,
  quote,
  sourceAmountRaw,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  sourceAmountRaw: string;
  transaction: TransactionMeta;
}): Promise<BatchTransactionParams[]> {
  const { transactionData } = messenger.call(
    'TransactionPayController:getState',
  );

  const { decimals } = quote.original.details.currencyOut.currency;
  const amountHuman = new BigNumber(sourceAmountRaw)
    .shiftedBy(-decimals)
    .toFixed();

  const { calls } = await messenger.call(
    'TransactionPayController:getPaymentOverrideData',
    {
      amount: amountHuman,
      transaction,
      transactionData: transactionData[transaction.id],
    },
  );

  if (!calls.length) {
    throw new Error(
      'Missing post-quote deposit calls from getPaymentOverrideData',
    );
  }

  return calls;
}

/**
 * Resolves the actual amount that landed on the recipient after a Relay bridge.
 * Prefers the on-chain Transfer log on `completion.targetHash`; falls back to
 * the Relay quote's minimum output when the target hash is the same-chain
 * `FALLBACK_HASH` placeholder or the on-chain read fails.
 *
 * @param options - Resolution options.
 * @param options.completion - Outcome of `waitForRelayCompletion`.
 * @param options.messenger - Controller messenger.
 * @param options.quote - The Relay quote that was submitted.
 * @returns The raw (atomic) settled amount as a decimal string.
 */
async function resolveSettledAmount({
  completion,
  messenger,
  quote,
}: {
  completion: RelayCompletionOutcome;
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
}): Promise<string> {
  const recipient = (quote.request.recipient ?? quote.request.from) as
    | Hex
    | undefined;

  if (
    recipient &&
    completion.targetHash &&
    completion.targetHash !== FALLBACK_HASH
  ) {
    try {
      const { amountRaw: onChainAmount } = await getTransferredAmountFromTxHash(
        {
          messenger,
          txHash: completion.targetHash,
          chainId: quote.request.targetChainId,
          tokenAddress: quote.request.targetTokenAddress,
          walletAddress: recipient,
        },
      );

      if (onChainAmount) {
        log('Resolved settled amount from on-chain transaction', {
          targetHash: completion.targetHash,
          onChainAmount,
        });
        return onChainAmount;
      }
    } catch (error) {
      log(
        'Failed to read on-chain amount, falling back to quote minimum output',
        { targetHash: completion.targetHash, error },
      );
    }
  }

  const fallback = quote.original.details.currencyOut.minimumAmount;

  if (!fallback) {
    throw new Error('Cannot resolve post-completion amount');
  }

  log('Resolved settled amount from quote minimum output', {
    fallback,
    targetHash: completion.targetHash,
  });

  return fallback;
}

function setRelaySourceHash(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  sourceHash: Hex,
): void {
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
}

async function waitForRelayCompletion(
  quote: RelayQuote,
  messenger: TransactionPayControllerMessenger,
  options: {
    onSourceHash?: (hash: Hex) => void;
    tolerateFailure?: boolean;
  },
): Promise<RelayCompletionOutcome> {
  const { onSourceHash, tolerateFailure } = options;

  const isSameChain =
    quote.details.currencyIn.currency.chainId ===
    quote.details.currencyOut.currency.chainId;

  const isSingleDepositStep =
    quote.steps.length === 1 && quote.steps[0].id === 'deposit';

  if (isSameChain && !isSingleDepositStep) {
    log('Skipping polling as same chain');
    return { status: 'success', targetHash: FALLBACK_HASH };
  }

  const { requestId } = quote.steps[0];

  const pollingInterval = getRelayPollingInterval(messenger);
  const pollingTimeout = getRelayPollingTimeout(messenger);
  const hasTimeout = pollingTimeout !== undefined && pollingTimeout > 0;

  log('Polling config', { pollingInterval, pollingTimeout });
  const startTime = Date.now();

  let sourceHashEmitted = false;
  let lastStatus: RelayStatus | undefined;

  while (true) {
    let status: RelayStatusResponse | undefined;

    try {
      status = await getRelayStatus(requestId);
    } catch (error) {
      log('Polling network error', error);
    }

    if (status) {
      log('Polled status', status.status, status);
      lastStatus = status.status;

      if (!sourceHashEmitted && status.inTxHashes?.length) {
        sourceHashEmitted = true;
        onSourceHash?.(status.inTxHashes[0] as Hex);
      }

      if (status.status === 'success') {
        const targetHash =
          (status.txHashes?.slice(-1)[0] as Hex | undefined) ?? FALLBACK_HASH;
        return { status: 'success', targetHash };
      }

      if (!RELAY_PENDING_STATUSES.includes(status.status)) {
        if (RELAY_FAILURE_STATUSES.includes(status.status)) {
          if (tolerateFailure) {
            log('Relay ended in failure status (tolerated)', status.status);
            return { status: status.status };
          }
          throw new Error(`Request failed with status: ${status.status}`);
        }
        throw new Error(`Unrecognized status: ${status.status}`);
      }
    }

    if (hasTimeout && Date.now() - startTime >= pollingTimeout) {
      const statusDetail = lastStatus ? ` (last status: ${lastStatus})` : '';
      if (tolerateFailure) {
        log('Relay polling timed out (tolerated)', statusDetail);
        return { status: 'timeout' };
      }
      throw new Error(`Polling timed out${statusDetail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
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
  params: RelayTransactionStep['items'][0]['data'],
  messenger: TransactionPayControllerMessenger,
): TransactionParams {
  const featureFlags = getFeatureFlags(messenger);

  return {
    data: params.data,
    from: params.from,
    gas: toHex(params.gas ?? featureFlags.relayFallbackGas.max),
    maxFeePerGas:
      params.maxFeePerGas === undefined
        ? undefined
        : toHex(params.maxFeePerGas),
    maxPriorityFeePerGas:
      params.maxPriorityFeePerGas === undefined
        ? undefined
        : toHex(params.maxPriorityFeePerGas),
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
  const txSteps = steps.filter(
    (step): step is RelayTransactionStep => step.kind === 'transaction',
  );
  const params = txSteps.flatMap((step) => step.items).map((item) => item.data);
  const SUPPORTED_STEP_KINDS = ['transaction', 'signature'];
  const invalidKind = steps.find(
    (step) => !SUPPORTED_STEP_KINDS.includes(step.kind),
  )?.kind;

  if (invalidKind) {
    throw new Error(`Unsupported step kind: ${invalidKind}`);
  }

  // In post-quote flows (e.g. Predict withdraw), the source tokens are held in
  // the Safe — not the EOA — and only become available after the original tx
  // executes as part of the batch. Skip the EOA balance check here.
  if (!quote.request.isPostQuote && !quote.request.paymentOverride) {
    await validateSourceBalance(quote, messenger);
  }

  const normalizedParams = params.map((singleParams) =>
    normalizeParams(singleParams, messenger),
  );

  // For post-quote flows, prepend the original transaction so it gets
  // included in the batch alongside the relay deposit(s).
  // This always results in multiple params, so it takes the batch path.
  // When an accountOverride is set (detected by `from` divergence between the
  // quote and the original tx), the override account does not directly hold
  // the funds for the original call, so the prepended tx is replaced with a
  // delegation tx that redeems the original call on its behalf.
  const { isPostQuote } = quote.request;
  const hasAccountOverride =
    quote.request.from.toLowerCase() !==
    (transaction.txParams.from as Hex).toLowerCase();

  // Only prepend the payment override onto the source execute batch for
  // same-chain atomic flows. For cross-chain flows (e.g. Predict withdraw on
  // Polygon depositing to a Money Account on Monad) the deposit is carried in
  // the relay quote's destination txs[] and runs on the destination chain; its
  // delegation is signed for the destination chainId, so redeeming it inside
  // the source-chain batch recovers a wrong signer and reverts. In that case
  // we fall through and prepend the original (e.g. Predict withdraw) tx
  // instead. Non-atomic flows are also excluded: their second leg is submitted
  // separately by `submitPostCompletionBatch` after Relay completion, so
  // prepending it here would double-embed the vault deposit.
  const isSameChainOverride =
    quote.original.details.currencyIn.currency.chainId ===
    quote.original.details.currencyOut.currency.chainId;
  const isNonAtomic = quote.request.atomic === false;

  let allParams = normalizedParams;

  if (
    quote.request.paymentOverride &&
    isSameChainOverride &&
    !isNonAtomic
  ) {
    const { transactionData } = messenger.call(
      'TransactionPayController:getState',
    );

    const { calls: overrideTxs } = await messenger.call(
      'TransactionPayController:getPaymentOverrideData',
      {
        amount: quote.sourceAmount.human,
        transaction,
        transactionData: transactionData[transaction.id],
      },
    );

    if (overrideTxs.length > 0) {
      allParams = [
        ...(overrideTxs as TransactionParams[]),
        ...normalizedParams,
      ];
    }
  } else if (isPostQuote && transaction.txParams.to) {
    const prependedParams = hasAccountOverride
      ? await buildDelegatedOriginalParams(
          transaction,
          messenger,
          normalizedParams[0],
        )
      : ({
          data: transaction.txParams.data as Hex | undefined,
          from: transaction.txParams.from,
          maxFeePerGas: normalizedParams[0]?.maxFeePerGas,
          maxPriorityFeePerGas: normalizedParams[0]?.maxPriorityFeePerGas,
          to: transaction.txParams.to,
          value: transaction.txParams.value as Hex | undefined,
        } as TransactionParams);

    allParams = [prependedParams, ...normalizedParams];
  }

  if (quote.original.metamask.isExecute) {
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
 * Build TransactionParams for a delegation that redeems the original
 * post-quote transaction on behalf of the override account. Used when the
 * override account cannot execute the original call directly.
 *
 * The original tx is already on the correct chain and from the money
 * account, so it can be passed through to `getDelegationTransaction`
 * unchanged.
 *
 * @param transaction - Original transaction meta to be redeemed.
 * @param messenger - Controller messenger.
 * @param relayParams - Optional relay params to copy gas fee fields from.
 * @returns Transaction params for the delegation tx.
 */
async function buildDelegatedOriginalParams(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  relayParams?: TransactionParams,
): Promise<TransactionParams> {
  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  log('Delegation result for prepended original tx', delegation);

  return {
    data: delegation.data,
    from: transaction.txParams.from as Hex,
    maxFeePerGas: relayParams?.maxFeePerGas,
    maxPriorityFeePerGas: relayParams?.maxPriorityFeePerGas,
    to: delegation.to,
    value: delegation.value,
  };
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

  const networkClientId = getNetworkClientId(messenger, sourceChainId);

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

  const isSourceGasFeeSponsored =
    transaction.isGasFeeSponsored &&
    quote.request.sourceChainId === transaction.chainId &&
    quote.request.targetChainId === transaction.chainId;

  const gasFeeToken =
    !isSourceGasFeeSponsored && quote.fees.isSourceGasFeeToken
      ? sourceTokenAddress
      : undefined;

  log('Submitting transactions', {
    isPostQuote,
    gasFeeToken,
    allParamsCount: allParams.length,
  });

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

  const { metamask } = quote.original;
  const { gasLimits } = metamask;

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
        isInternal: true,
        isGasFeeSponsored: isSourceGasFeeSponsored,
        requireApproval: false,
        type: getRelayDepositType(getEffectiveTransactionType(transaction)),
      },
    );
  } else {
    const gasLimit7702 = metamask.is7702
      ? toHex(metamask.gasLimits[0])
      : undefined;

    const prependCount = allParams.length - normalizedParams.length;

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
          prependCount,
          index,
          getEffectiveTransactionType(transaction),
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
      isInternal: true,
      isGasFeeSponsored: isSourceGasFeeSponsored,
      overwriteUpgrade: true,
      requireApproval: false,
      transactions,
    });
  }

  end();

  log('Added transactions', transactionIds);

  if (!transactionIds.length) {
    throw new Error('No transactions submitted');
  }

  if (result) {
    const txHash = await result.result;
    log('Submitted transaction', txHash);
  }

  await Promise.all(
    transactionIds.map((txId) => waitForTransactionConfirmed(txId, messenger)),
  );

  log('All transactions confirmed', transactionIds);

  const hash = getTransaction(transactionIds.slice(-1)[0], messenger)?.hash;

  if (!hash) {
    throw new Error('Missing transaction hash');
  }

  return hash as Hex;
}

/**
 * Determine the transaction type for a given index in the batch.
 *
 * @param prependCount - Number of non-relay txs prepended to the batch.
 * @param index - Index of the transaction in the batch.
 * @param originalType - Type of the original transaction (used for prepended indices).
 * @param relayParamCount - Number of relay-only params (excludes prepended txs).
 * @returns The transaction type.
 */
function getTransactionType(
  prependCount: number,
  index: number,
  originalType: TransactionMeta['type'],
  relayParamCount: number,
): TransactionMeta['type'] {
  if (prependCount > 0 && index < prependCount) {
    return originalType;
  }

  const relayIndex = index - prependCount;

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

/**
 * Get the effective transaction type, resolving through nested transactions
 * when the top-level type is `batch`.
 *
 * @param transaction - The transaction metadata.
 * @returns The resolved type from nested transactions, or the top-level type.
 */
function getEffectiveTransactionType(
  transaction: TransactionMeta,
): TransactionMeta['type'] {
  if (transaction.type !== TransactionType.batch) {
    return transaction.type;
  }

  const nestedType = transaction.nestedTransactions?.find(
    (tx) => tx.type && RELAY_DEPOSIT_TYPES[tx.type] !== undefined,
  )?.type;

  return nestedType ?? transaction.type;
}
