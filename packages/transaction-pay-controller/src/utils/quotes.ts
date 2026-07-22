import { TransactionStatus } from '@metamask/transaction-controller';
import type {
  BatchTransaction,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { PaymentOverride, TransactionPayStrategy } from '../constants';
import { projectLogger } from '../logger';
import type {
  QuoteRequest,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayRequiredToken,
  TransactionPaySourceAmount,
  TransactionPayTotals,
  TransactionPaymentToken,
  UpdateTransactionDataCallback,
} from '../types';
import { accountSupports7702 } from './7702';
import { buildNoOpQuote } from './no-op-quote';
import {
  checkStrategyQuoteSupport,
  checkStrategySupport,
  getStrategiesByName,
  getStrategyByName,
} from './strategy';
import {
  computeTokenAmounts,
  getLiveTokenBalance,
  getTokenFiatRate,
} from './token';
import { calculateTotals } from './totals';
import { getTransaction, updateTransaction } from './transaction';

const DEFAULT_REFRESH_INTERVAL = 30 * 1000; // 30 Seconds

const log = createModuleLogger(projectLogger, 'quotes');

const inFlightQuoteRequests = new Map<string, AbortController>();

export type UpdateQuotesRequest = {
  getStrategies: (transaction: TransactionMeta) => TransactionPayStrategy[];
  messenger: TransactionPayControllerMessenger;
  signal?: AbortSignal;
  transactionData: TransactionData | undefined;
  transactionId: string;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update the quotes for a specific transaction.
 *
 * Calls for the same `transactionId` are serialised: a fresh call aborts any
 * previous in-flight call so a slower stale response cannot overwrite a newer
 * one in state.
 *
 * @param request - Request parameters.
 * @returns Boolean indicating if the quotes were updated. Returns `false` when
 * the call was aborted by a subsequent call for the same transaction.
 */
export async function updateQuotes(
  request: UpdateQuotesRequest,
): Promise<boolean> {
  const {
    getStrategies,
    messenger,
    signal: externalSignal,
    transactionData,
    transactionId,
    updateTransactionData,
  } = request;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction || !transactionData) {
    throw new Error('Transaction not found');
  }

  if (transaction?.status !== TransactionStatus.unapproved) {
    return false;
  }

  log('Updating quotes', { transactionId });

  const {
    accountOverride,
    isMaxAmount,
    isPostQuote,
    isHyperliquidSource,
    isPolymarketDepositWallet,
    isQuoteRequired,
    paymentOverride,
    paymentToken: originalPaymentToken,
    fiatPayment,
    refundTo,
    sourceAmounts,
    tokens,
  } = transactionData;

  const from = accountOverride ?? (transaction.txParams.from as Hex);

  const controller = abortPreviousAndCreateController(transactionId);
  const { signal } = controller;
  const abortFromExternalSignal = (): void =>
    controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, {
      once: true,
    });
  }

  updateTransactionData(transactionId, (data) => {
    data.isLoading = true;
  });

  try {
    const paymentToken = await refreshPaymentTokenBalance({
      from,
      messenger,
      paymentToken: originalPaymentToken,
      signal,
      transactionId,
      updateTransactionData,
    });

    if (signal.aborted) {
      log('Quote request aborted before building requests', { transactionId });
      return false;
    }

    const requests = buildQuoteRequests({
      from,
      isMaxAmount: isMaxAmount ?? false,
      isPostQuote,
      isHyperliquidSource,
      isPolymarketDepositWallet,
      paymentOverride,
      paymentToken,
      refundTo,
      sourceAmounts,
      tokens,
      transactionId,
    });

    const supports7702 = accountSupports7702(messenger, from);

    const { batchTransactions, quotes } = await getQuotes(
      transaction,
      from,
      requests,
      paymentToken,
      isQuoteRequired ?? false,
      supports7702,
      getStrategies,
      messenger,
      fiatPayment?.selectedPaymentMethodId,
      signal,
    );

    if (signal.aborted) {
      log('Quote request aborted before persisting results', { transactionId });
      return false;
    }

    // No-op quotes mark direct routes. They have no fees or amounts and the
    // transaction is signed and submitted locally, so totals and transaction
    // sync must treat them as "no quotes".
    const executableQuotes = quotes.filter(
      (quote) => quote.strategy !== TransactionPayStrategy.None,
    );

    const totals = calculateTotals({
      fiatPaymentAmount: fiatPayment?.amountFiat,
      isMaxAmount,
      messenger,
      quotes: executableQuotes as TransactionPayQuote<unknown>[],
      tokens,
      transaction,
    });

    log('Calculated totals', { transactionId, totals });

    syncTransaction({
      batchTransactions,
      selectedFiatPayment: fiatPayment?.selectedPaymentMethodId,
      hasQuotes: executableQuotes.length > 0,
      isPostQuote,
      messenger: messenger as never,
      paymentToken,
      totals,
      transactionId,
    });

    updateTransactionData(transactionId, (data) => {
      data.quotes = quotes as never;
      data.quotesLastUpdated = Date.now();
      data.totals = totals;
    });
  } catch (error) {
    if (signal.aborted) {
      log('Quote request aborted', { transactionId, reason: signal.reason });
      return false;
    }
    throw error;
  } finally {
    if (!signal.aborted) {
      updateTransactionData(transactionId, (data) => {
        data.isLoading = false;
      });
    }
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    clearControllerIfCurrent(transactionId, controller);
  }

  return true;
}

/**
 * Sync batch transactions to the transaction meta.
 *
 * @param request - Request object.
 * @param request.batchTransactions - Batch transactions to sync.
 * @param request.hasQuotes - Whether MM Pay produced any quotes for this transaction.
 * @param request.isPostQuote - Whether this is a post-quote flow.
 * @param request.messenger - Messenger instance.
 * @param request.paymentToken - Payment token (source for standard flows, destination for post-quote).
 * @param request.selectedFiatPayment - Selected fiat payment method ID.
 * @param request.totals - Calculated totals.
 * @param request.transactionId - ID of the transaction to sync.
 */
function syncTransaction({
  batchTransactions,
  hasQuotes,
  isPostQuote,
  messenger,
  paymentToken,
  selectedFiatPayment,
  totals,
  transactionId,
}: {
  batchTransactions: BatchTransaction[];
  selectedFiatPayment?: string;
  hasQuotes: boolean;
  isPostQuote?: boolean;
  messenger: TransactionPayControllerMessenger;
  paymentToken: TransactionPaymentToken | undefined;
  totals: TransactionPayTotals;
  transactionId: string;
}): void {
  if (!paymentToken && !selectedFiatPayment) {
    return;
  }

  updateTransaction(
    {
      transactionId,
      messenger: messenger as never,
      note: 'Update transaction pay data',
    },
    (tx: TransactionMeta) => {
      tx.batchTransactions = batchTransactions;
      tx.batchTransactionsOptions = {};

      // When MM Pay has produced quotes, it owns submission of this transaction
      // via its strategy publish hook, so the parent must be marked externally
      // signed to skip the local `KeyringController:signTransaction` call.
      // When there are no quotes (e.g. user selected the target token as the
      // payment token in a Predict flow), the transaction falls back to normal
      // local signing, so the flag is cleared to allow that.
      // If gas is sponsored, TC owns this field — it is set based on the
      // Sentinel simulation result and must not be cleared here. Same-token
      // flows (e.g. Monad mUSD withdrawal via a Money Account) produce no
      // quotes but still need external sign because the account cannot sign
      // locally.
      if (!tx.isGasFeeSponsored) {
        tx.isExternalSign = hasQuotes;
      }

      tx.metamaskPay = {
        bridgeFeeFiat: totals.fees.provider.usd,
        chainId: paymentToken?.chainId,
        isPostQuote,
        networkFeeFiat: totals.fees.sourceNetwork.estimate.usd,
        targetFiat: totals.targetAmount.usd,
        tokenAddress: paymentToken?.address,
        totalFiat: totals.total.usd,
      };
    },
  );
}

/**
 * Refresh quotes for all transactions if expired.
 *
 * @param messenger - Messenger instance.
 * @param updateTransactionData - Callback to update transaction data.
 * @param getStrategies - Callback to get ordered strategy names for a transaction.
 */
export async function refreshQuotes(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
  getStrategies: (transaction: TransactionMeta) => TransactionPayStrategy[],
): Promise<void> {
  const state = messenger.call('TransactionPayController:getState');
  const transactionIds = Object.keys(state.transactionData);

  for (const transactionId of transactionIds) {
    const transactionData = state.transactionData[transactionId];
    const { isLoading, quotes, quotesLastUpdated } = transactionData;

    if (isLoading || !quotes?.length) {
      continue;
    }

    // No-op quotes mark direct routes and have nothing to refresh. They are
    // regenerated whenever the transaction data changes.
    if (
      quotes.every((quote) => quote.strategy === TransactionPayStrategy.None)
    ) {
      continue;
    }

    const strategyName = quotes[0].strategy;
    const strategy = getStrategyByName(strategyName);

    const refreshInterval =
      (await strategy.getRefreshInterval?.({
        chainId: quotes[0].request.sourceChainId,
        messenger,
      })) ?? DEFAULT_REFRESH_INTERVAL;

    const isExpired = Date.now() - (quotesLastUpdated ?? 0) > refreshInterval;

    if (!isExpired) {
      continue;
    }

    const isUpdated = await updateQuotes({
      getStrategies,
      messenger,
      transactionData,
      transactionId,
      updateTransactionData,
    });

    if (isUpdated) {
      log('Refreshed quotes', { transactionId, strategy: strategyName });
    }
  }
}

/**
 * Abort the active quote request for a transaction.
 *
 * @param transactionId - ID of the transaction whose quote should be aborted.
 */
export function abortQuotes(transactionId: string): void {
  const request = inFlightQuoteRequests.get(transactionId);

  if (request && !request.signal.aborted) {
    log('Aborting quote request', { transactionId });
    request.abort(new Error('Superseded by newer quote request'));
  }
}

function abortPreviousAndCreateController(
  transactionId: string,
): AbortController {
  abortQuotes(transactionId);

  const controller = new AbortController();
  inFlightQuoteRequests.set(transactionId, controller);
  return controller;
}

function clearControllerIfCurrent(
  transactionId: string,
  controller: AbortController,
): void {
  if (inFlightQuoteRequests.get(transactionId) === controller) {
    inFlightQuoteRequests.delete(transactionId);
  }
}

/**
 * Build quote requests required to retrieve quotes.
 *
 * @param request - Request parameters.
 * @param request.from - Address from which the transaction is sent.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.isHyperliquidSource - Whether the source of funds is HyperLiquid.
 * @param request.isPolymarketDepositWallet - Whether the source of funds is a Polymarket deposit wallet.
 * @param request.isPostQuote - Whether this is a post-quote flow.
 * @param request.paymentOverride - Optional payment override type for the transaction.
 * @param request.paymentToken - Payment token (source for standard flows, destination for post-quote).
 * @param request.refundTo - Optional address to receive refunds if the Relay transaction fails.
 * @param request.sourceAmounts - Source amounts for the transaction.
 * @param request.tokens - Required tokens for the transaction.
 * @param request.transactionId - ID of the transaction.
 * @returns Array of quote requests.
 */
function buildQuoteRequests({
  from,
  isMaxAmount,
  isPostQuote,
  isHyperliquidSource,
  isPolymarketDepositWallet,
  paymentOverride,
  paymentToken,
  refundTo,
  sourceAmounts,
  tokens,
  transactionId,
}: {
  from: Hex;
  isMaxAmount: boolean;
  isPostQuote?: boolean;
  isHyperliquidSource?: boolean;
  isPolymarketDepositWallet?: boolean;
  paymentOverride?: PaymentOverride;
  paymentToken: TransactionPaymentToken | undefined;
  refundTo?: Hex;
  sourceAmounts: TransactionPaySourceAmount[] | undefined;
  tokens: TransactionPayRequiredToken[];
  transactionId: string;
}): QuoteRequest[] {
  if (!paymentToken) {
    return [];
  }

  if (isPostQuote) {
    return buildPostQuoteRequests({
      from,
      isMaxAmount,
      isHyperliquidSource,
      isPolymarketDepositWallet,
      paymentOverride,
      destinationToken: paymentToken,
      refundTo,
      sourceAmounts,
      transactionId,
    });
  }

  // Standard flow: source = paymentToken, target = required tokens
  const requests = (sourceAmounts ?? []).map((sourceAmount) => {
    const token = tokens.find(
      (singleToken) => singleToken.address === sourceAmount.targetTokenAddress,
    ) as TransactionPayRequiredToken;

    return {
      from,
      isMaxAmount,
      paymentOverride,
      sourceBalanceRaw: paymentToken.balanceRaw,
      sourceTokenAmount: sourceAmount.sourceAmountRaw,
      sourceChainId: paymentToken.chainId,
      sourceTokenAddress: paymentToken.address,
      targetAmountMinimum: token.allowUnderMinimum ? '0' : token.amountRaw,
      targetChainId: token.chainId,
      targetTokenAddress: token.address,
    };
  });

  if (!requests.length) {
    log('No quote requests', { transactionId });
  }

  return requests;
}

/**
 * Build quote requests for post-quote flows.
 * In this flow, the source is the transaction's required token,
 * and the target is the user's selected destination token (paymentToken).
 *
 * @param request - Request parameters.
 * @param request.from - Address from which the transaction is sent.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.isHyperliquidSource - Whether the source of funds is HyperLiquid.
 * @param request.isPolymarketDepositWallet - Whether the source of funds is a Polymarket deposit wallet.
 * @param request.paymentOverride - Optional payment override type for the transaction.
 * @param request.destinationToken - Destination token (paymentToken in post-quote mode).
 * @param request.refundTo - Optional address to receive refunds if the Relay transaction fails.
 * @param request.sourceAmounts - Source amounts for the transaction (includes source token info).
 * @param request.transactionId - ID of the transaction.
 * @returns Array of quote requests for post-quote flow.
 */
function buildPostQuoteRequests({
  from,
  isMaxAmount,
  isHyperliquidSource,
  isPolymarketDepositWallet,
  paymentOverride,
  destinationToken,
  refundTo,
  sourceAmounts,
  transactionId,
}: {
  from: Hex;
  isMaxAmount: boolean;
  isHyperliquidSource?: boolean;
  isPolymarketDepositWallet?: boolean;
  paymentOverride?: PaymentOverride;
  destinationToken: TransactionPaymentToken;
  refundTo?: Hex;
  sourceAmounts: TransactionPaySourceAmount[] | undefined;
  transactionId: string;
}): QuoteRequest[] {
  // Find the source amount where targetTokenAddress matches the destination token
  const sourceAmount = sourceAmounts?.find(
    (amount) =>
      amount.targetTokenAddress.toLowerCase() ===
      destinationToken.address.toLowerCase(),
  );

  // Same-token-same-chain cases are already filtered in source-amounts.ts
  if (
    !sourceAmount?.sourceBalanceRaw ||
    !sourceAmount.sourceChainId ||
    !sourceAmount.sourceTokenAddress
  ) {
    log('No valid source amount found for post-quote request', {
      transactionId,
    });
    return [];
  }

  const request: QuoteRequest = {
    from,
    isMaxAmount,
    isPostQuote: true,
    isHyperliquidSource,
    isPolymarketDepositWallet,
    paymentOverride,
    refundTo,
    sourceBalanceRaw: sourceAmount.sourceBalanceRaw,
    sourceTokenAmount: sourceAmount.sourceAmountRaw,
    sourceChainId: sourceAmount.sourceChainId,
    sourceTokenAddress: sourceAmount.sourceTokenAddress,
    targetAmountMinimum: '0',
    targetChainId: destinationToken.chainId,
    targetTokenAddress: destinationToken.address,
  };

  log('Post-quote request built', { transactionId, request });

  // Currently only single token post-quote flows are supported.
  // Multiple token support would require multiple quotes for each required token.
  return [request];
}

async function refreshPaymentTokenBalance({
  from,
  messenger,
  paymentToken,
  signal,
  transactionId,
  updateTransactionData,
}: {
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  paymentToken: TransactionPaymentToken | undefined;
  signal: AbortSignal;
  transactionId: string;
  updateTransactionData: UpdateTransactionDataCallback;
}): Promise<TransactionPaymentToken | undefined> {
  if (!paymentToken) {
    return undefined;
  }

  try {
    const fiatRates = getTokenFiatRate(
      messenger,
      paymentToken.address,
      paymentToken.chainId,
    );

    if (!fiatRates) {
      return paymentToken;
    }

    const liveBalance = await getLiveTokenBalance(
      messenger,
      from,
      paymentToken.chainId,
      paymentToken.address,
    );

    if (signal.aborted) {
      log('Payment token balance refresh aborted', { transactionId });
      return paymentToken;
    }

    const {
      raw: balanceRaw,
      human: balanceHuman,
      usd: balanceUsd,
      fiat: balanceFiat,
    } = computeTokenAmounts(liveBalance, paymentToken.decimals, fiatRates);

    const updatedToken = {
      ...paymentToken,
      balanceFiat,
      balanceHuman,
      balanceRaw,
      balanceUsd,
    };

    updateTransactionData(transactionId, (data) => {
      data.paymentToken = updatedToken;
    });

    log('Refreshed payment token balance', { transactionId, balanceRaw });

    return updatedToken;
  } catch (error) {
    log('Failed to refresh payment token balance', { transactionId, error });
    return paymentToken;
  }
}

/**
 * Retrieve quotes for a transaction.
 *
 * @param transaction - Transaction metadata.
 * @param from - Resolved wallet address (`accountOverride ?? txParams.from`).
 * @param requests - Quote requests.
 * @param paymentToken - Selected payment token, if any.
 * @param isQuoteRequired - Whether a quote is always required for the transaction.
 * @param isAccountEIP7702Compatible - Whether the account supports EIP-7702.
 * @param getStrategies - Callback to get ordered strategy names for a transaction.
 * @param messenger - Controller messenger.
 * @param fiatPaymentMethod - Selected fiat payment method ID, if applicable.
 * @param signal - Signal that aborts when the quote request is superseded.
 * @returns An object containing batch transactions and quotes.
 */
async function getQuotes(
  transaction: TransactionMeta,
  from: Hex,
  requests: QuoteRequest[],
  paymentToken: TransactionPaymentToken | undefined,
  isQuoteRequired: boolean,
  isAccountEIP7702Compatible: boolean,
  getStrategies: (transaction: TransactionMeta) => TransactionPayStrategy[],
  messenger: TransactionPayControllerMessenger,
  fiatPaymentMethod?: string,
  signal?: AbortSignal,
): Promise<{
  batchTransactions: BatchTransaction[];
  quotes: TransactionPayQuote<Json>[];
}> {
  const { id: transactionId } = transaction;
  const strategies = getStrategiesByName(
    getStrategies(transaction),
    (strategyName) => {
      log('Skipping unknown strategy', {
        strategy: strategyName,
        transactionId,
      });
    },
  );

  if (!requests?.length && !fiatPaymentMethod) {
    // A selected payment token with no conversion requests means the route is
    // direct. Return an explicit no-op quote so clients and the publish hook
    // can distinguish "no conversion needed" from "quote needed but missing".
    // Not applicable when a quote is always required, as an empty requests
    // list then means the source amounts could not be calculated.
    const noOpQuote =
      paymentToken && !isQuoteRequired
        ? buildNoOpQuote(from, paymentToken)
        : undefined;

    if (noOpQuote) {
      log('Built no-op quote for direct route', { transactionId });
    }

    return {
      batchTransactions: [],
      quotes: noOpQuote ? [noOpQuote] : [],
    };
  }

  const request = {
    accountSupports7702: isAccountEIP7702Compatible,
    fiatPaymentMethod,
    from,
    messenger,
    requests,
    signal,
    transaction,
  };

  for (const { name, strategy } of strategies) {
    try {
      const support = await checkStrategySupport(strategy, request);

      if (!support) {
        log('Strategy does not support request', {
          strategy: name,
          transactionId,
        });
        continue;
      }

      const quotes = (await strategy.getQuotes(
        request,
      )) as TransactionPayQuote<Json>[];

      if (!quotes.length) {
        log('Strategy returned no quotes', { strategy: name, transactionId });
        continue;
      }

      const quoteSupport = await checkStrategyQuoteSupport(strategy, {
        messenger,
        quotes,
        signal,
        transaction,
      });

      if (!quoteSupport) {
        log('Strategy does not support quotes', {
          strategy: name,
          transactionId,
        });
        continue;
      }

      log('Updated', { transactionId, quotes });

      const batchTransactions = strategy.getBatchTransactions
        ? await strategy.getBatchTransactions({
            messenger,
            quotes,
            signal,
          })
        : [];

      log('Batch transactions', { transactionId, batchTransactions });

      return {
        batchTransactions,
        quotes,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      log('Strategy failed, trying next', {
        error,
        strategy: name,
        transactionId,
      });
      continue;
    }
  }

  log('No quotes available', { transactionId });

  return {
    batchTransactions: [],
    quotes: [],
  };
}
