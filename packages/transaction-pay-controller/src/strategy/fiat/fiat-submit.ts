import type {
  RampsOrder,
  RampsOrderCryptoCurrency,
} from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types';
import { buildCaipAssetType } from '../../utils/token';
import { getTransaction, updateTransaction } from '../../utils/transaction';
import { getRelayQuotes } from '../relay/relay-quotes';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote } from '../relay/types';
import type { TransactionPayFiatAsset } from './constants';
import type { FiatQuote } from './types';
import { deriveFiatAssetForFiatPayment, resolveSourceAmountRaw } from './utils';

const log = createModuleLogger(projectLogger, 'fiat-submit');

const ORDER_POLL_INTERVAL_MS = 1000;
const ORDER_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RATE_DRIFT_PERCENT = 10;

const TERMINAL_FAILURE_STATUSES: RampsOrderStatus[] = [
  RampsOrderStatus.Cancelled,
  RampsOrderStatus.Failed,
  RampsOrderStatus.IdExpired,
];

/**
 * Submits fiat strategy quotes by polling the on-ramp order until completion,
 * then re-quoting and submitting the relay leg with the settled crypto amount.
 *
 * @param request - Strategy execute request containing fiat quotes, messenger, and transaction metadata.
 * @param request.messenger - Controller messenger for cross-controller calls.
 * @param request.quotes - Fiat quotes to execute (exactly one expected).
 * @param request.transaction - Original transaction metadata.
 * @param request.isSmartTransaction - Callback to check smart transaction eligibility.
 * @returns An object containing the relay transaction hash if available.
 */
export async function submitFiatQuotes(
  request: PayStrategyExecuteRequest<FiatQuote>,
): ReturnType<PayStrategy<FiatQuote>['execute']> {
  const { messenger, transaction } = request;
  const transactionId = transaction.id;
  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const walletAddress = (transactionData?.accountOverride ??
    transaction.txParams.from) as Hex | undefined;

  if (!walletAddress) {
    throw new Error('Missing wallet address for fiat submission');
  }

  const fiatPayment = transactionData?.fiatPayment;
  const orderId = fiatPayment?.orderId;

  if (!orderId) {
    throw new Error('Missing order ID for fiat submission');
  }

  const providerCode = extractProviderCode(fiatPayment?.rampsQuote?.provider);

  if (!providerCode) {
    throw new Error('Missing provider code for fiat submission');
  }

  updateTransaction(
    {
      transactionId,
      messenger,
      note: 'Persist fiat order metadata',
    },
    (tx) => {
      tx.metamaskPay ??= {};
      tx.metamaskPay.fiat = { orderId, provider: providerCode };
    },
  );

  log('Starting fiat order polling', {
    orderId,
    providerCode,
    transactionId,
  });

  const order = await waitForOrderCompletion({
    messenger,
    orderCode: orderId,
    providerCode,
    transactionId,
    walletAddress,
  });

  log('Fiat order completed', {
    cryptoAmount: order.cryptoAmount,
    orderId,
    transactionId,
  });

  return await submitRelayAfterFiatCompletion({ order, request });
}

/**
 * Extracts the provider code from a ramps provider string.
 *
 * Accepts the canonical provider code (e.g. `transak-native`) and, for
 * backwards compatibility, the legacy path form (e.g. `/providers/transak-native`).
 *
 * @param provider - Canonical provider code, or legacy provider path.
 * @returns The provider code, or `null` if the format is invalid.
 */
function extractProviderCode(provider: string | undefined): string | null {
  if (!provider) {
    return null;
  }

  const parts = provider.split('/').filter(Boolean);

  if (parts[0] === 'providers') {
    return parts[1] ?? null;
  }

  return parts.length === 1 ? parts[0] : null;
}

/**
 * Validates that the completed order's crypto asset matches the expected fiat asset.
 *
 * @param options - The validation options.
 * @param options.expectedAsset - The expected fiat asset derived from the transaction type.
 * @param options.orderCrypto - The crypto currency information from the completed order.
 * @param options.transactionId - Transaction ID for error reporting.
 */
function validateOrderAsset({
  expectedAsset,
  orderCrypto,
  transactionId,
}: {
  expectedAsset: TransactionPayFiatAsset;
  orderCrypto: RampsOrderCryptoCurrency | undefined;
  transactionId: string;
}): void {
  const orderAssetId = orderCrypto?.assetId?.toLowerCase();
  const expectedAssetId = buildCaipAssetType(
    expectedAsset.chainId,
    expectedAsset.address,
  ).toLowerCase();
  const expectedChainId = expectedAssetId.split('/')[0];
  const orderChainId = orderCrypto?.chainId?.toLowerCase();

  if (orderAssetId && orderAssetId !== expectedAssetId) {
    throw new Error(
      `Fiat order asset mismatch for transaction ${transactionId}: ` +
        `expected ${expectedAssetId}, got ${orderAssetId}`,
    );
  }

  if (orderChainId && orderChainId !== expectedChainId) {
    throw new Error(
      `Fiat order chain mismatch for transaction ${transactionId}: ` +
        `expected ${expectedChainId}, got ${orderChainId}`,
    );
  }
}

/**
 * Polls the on-ramp order until it reaches a terminal status.
 *
 * @param options - The polling options.
 * @param options.messenger - Controller messenger for calling `RampsController:getOrder`.
 * @param options.orderCode - The order identifier within the provider.
 * @param options.providerCode - The on-ramp provider code (e.g. "transak").
 * @param options.transactionId - Transaction ID for logging.
 * @param options.walletAddress - Wallet address associated with the order.
 * @returns The completed order data.
 */
async function waitForOrderCompletion({
  messenger,
  orderCode,
  providerCode,
  transactionId,
  walletAddress,
}: {
  messenger: TransactionPayControllerMessenger;
  orderCode: string;
  providerCode: string;
  transactionId: string;
  walletAddress: string;
}): Promise<RampsOrder> {
  const startTime = Date.now();
  let lastStatus: string | undefined;

  while (true) {
    let order: RampsOrder | undefined;

    try {
      order = await messenger.call(
        'RampsController:getOrder',
        providerCode,
        orderCode,
        walletAddress,
      );
    } catch (error) {
      log('Order polling network error', error);
    }

    if (order) {
      lastStatus = order.status;

      log('Polled fiat order', {
        orderStatus: order.status,
        providerCode,
        transactionId,
      });

      if (order.status === RampsOrderStatus.Completed) {
        return order;
      }

      if (TERMINAL_FAILURE_STATUSES.includes(order.status)) {
        throw new Error(`Fiat order ${order.status.toLowerCase()}`);
      }
    }

    if (Date.now() - startTime >= ORDER_POLL_TIMEOUT_MS) {
      throw new Error(
        `Fiat order polling timed out (last status: ${lastStatus})`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, ORDER_POLL_INTERVAL_MS));
  }
}

/**
 * Re-quotes and submits the relay leg using the settled amount from a completed fiat order.
 *
 * @param options - The submission options.
 * @param options.order - The completed on-ramp order containing the settled crypto amount.
 * @param options.request - The original fiat strategy execute request.
 * @returns An object containing the relay transaction hash if available.
 */
async function submitRelayAfterFiatCompletion({
  order,
  request,
}: {
  order: RampsOrder;
  request: PayStrategyExecuteRequest<FiatQuote>;
}): Promise<{ transactionHash?: Hex }> {
  const { messenger, quotes, transaction } = request;
  const transactionId = transaction.id;

  if (!quotes.length) {
    throw new Error('Missing fiat quote for relay submission');
  }

  if (quotes.length > 1) {
    throw new Error('Multiple fiat quotes are not supported for submission');
  }

  const fiatAsset = deriveFiatAssetForFiatPayment(transaction, messenger);

  validateOrderAsset({
    expectedAsset: fiatAsset,
    orderCrypto: order.cryptoCurrency,
    transactionId,
  });

  const baseRequest = quotes[0].request;
  const walletAddress = baseRequest.from;

  const sourceAmountRaw = await resolveSourceAmountRaw({
    messenger,
    order,
    fiatAsset,
    walletAddress,
  });

  const hasNestedCalldata = (transaction.nestedTransactions?.length ?? 0) >= 2;

  // Transactions with nested calldata (e.g. moneyAccountDeposit with
  // approve + deposit) need a three-phase flow: discovery quote to learn
  // the target amount, calldata re-encoding, then a delegation quote.
  // Simple deposits (Perps, Predict) skip straight to a single EXACT_INPUT
  // relay quote — cheaper fees, no leftover dust, one fewer request.
  if (hasNestedCalldata) {
    return await submitWithCalldataReEncoding({
      baseRequest,
      request,
      sourceAmountRaw,
      transaction,
    });
  }

  return await submitSimpleRelay({
    baseRequest,
    request,
    sourceAmountRaw,
    transaction,
  });
}

/**
 * Submits a single EXACT_INPUT relay quote for simple deposits
 * that don't require nested calldata re-encoding or delegation.
 *
 * @param options - The submission options.
 * @param options.baseRequest - The base quote request from the original fiat quote.
 * @param options.request - The original fiat strategy execute request.
 * @param options.sourceAmountRaw - The settled source amount in atomic units.
 * @param options.transaction - The transaction metadata.
 * @returns An object containing the relay transaction hash if available.
 */
async function submitSimpleRelay({
  baseRequest,
  request,
  sourceAmountRaw,
  transaction,
}: {
  baseRequest: QuoteRequest;
  request: PayStrategyExecuteRequest<FiatQuote>;
  sourceAmountRaw: string;
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
}): Promise<{ transactionHash?: Hex }> {
  const { messenger } = request;
  const transactionId = transaction.id;

  const originalRelayQuote = request.quotes[0].original.relayQuote;

  const relayRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: false,
    isPostQuote: true,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
  };

  const relayQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    messenger,
    requests: [relayRequest],
    transaction,
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  validateRelayRateDrift({
    originalQuote: originalRelayQuote,
    discoveryQuote: relayQuotes[0].original,
    transactionId,
  });

  log('Submitting simple relay after fiat settlement', {
    relayQuoteCount: relayQuotes.length,
    transactionId,
  });

  return await submitRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    isSmartTransaction: request.isSmartTransaction,
    messenger,
    quotes: relayQuotes,
    transaction,
  });
}

/**
 * Submits relay quotes using the three-phase flow for transactions with nested
 * calldata that needs re-encoding (e.g. moneyAccountDeposit with approve + deposit).
 *
 * Phase 1: Discovery quote (EXACT_INPUT) to learn the target token output.
 * Phase 2: Delegate calldata re-encoding to the client via getAmountData.
 * Phase 3: Delegation quote (EXACT_OUTPUT) with updated nested transaction data.
 *
 * @param options - The submission options.
 * @param options.baseRequest - The base quote request from the original fiat quote.
 * @param options.request - The original fiat strategy execute request.
 * @param options.sourceAmountRaw - The settled source amount in atomic units.
 * @param options.transaction - The transaction metadata.
 * @returns An object containing the relay transaction hash if available.
 */
async function submitWithCalldataReEncoding({
  baseRequest,
  request,
  sourceAmountRaw,
  transaction,
}: {
  baseRequest: QuoteRequest;
  request: PayStrategyExecuteRequest<FiatQuote>;
  sourceAmountRaw: string;
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
}): Promise<{ transactionHash?: Hex }> {
  const { messenger } = request;
  const transactionId = transaction.id;

  const discoveryRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: false,
    isPostQuote: true,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
  };

  const discoveryQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    messenger,
    requests: [discoveryRequest],
    transaction,
  });

  if (!discoveryQuotes.length) {
    throw new Error('No relay quotes returned for fiat discovery');
  }

  const discoveryRelay = discoveryQuotes[0].original;
  const settledTargetRaw = discoveryRelay.details.currencyOut.minimumAmount;

  const originalRelayQuote = request.quotes[0].original.relayQuote;
  validateRelayRateDrift({
    originalQuote: originalRelayQuote,
    discoveryQuote: discoveryRelay,
    transactionId,
  });

  const { updates } = await messenger.call(
    'TransactionPayController:getAmountData',
    { amount: settledTargetRaw, transaction },
  );

  if (!updates.length) {
    throw new Error(
      'getAmountData returned no updates for transaction with nested calldata',
    );
  }

  updateTransaction(
    { transactionId, messenger, note: 'Fiat deposit: update settled amount' },
    (tx) => {
      for (const { nestedTransactionIndex, data } of updates) {
        if (tx.nestedTransactions?.[nestedTransactionIndex]) {
          tx.nestedTransactions[nestedTransactionIndex].data = data;
        }
      }
      if (tx.requiredAssets?.[0]) {
        tx.requiredAssets[0].amount = `0x${new BigNumber(settledTargetRaw).toString(16)}`;
      }
    },
  );

  const updatedTransaction =
    getTransaction(transactionId, messenger) ?? transaction;

  const relayRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: false,
    isPostQuote: false,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
    targetAmountMinimum: settledTargetRaw,
  };

  const relayQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    messenger,
    requests: [relayRequest],
    transaction: updatedTransaction,
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  log('Received relay quotes for completed fiat order', {
    relayQuoteCount: relayQuotes.length,
    transactionId,
  });

  return await submitRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    isSmartTransaction: request.isSmartTransaction,
    messenger,
    quotes: relayQuotes,
    transaction: updatedTransaction,
  });
}

/**
 * Validates that the relay exchange rate hasn't drifted significantly between
 * the original quoting phase and the post-settlement discovery quote.
 *
 * Compares the USD output/input ratio from both quotes. This normalises for
 * different source amounts (quoting phase uses a theoretical amount, discovery
 * uses the actual settled amount) so the comparison reflects genuine rate
 * movement rather than amount differences.
 *
 * @param options - The validation options.
 * @param options.originalQuote - Relay quote from the original quoting phase.
 * @param options.discoveryQuote - Relay quote from the post-settlement discovery.
 * @param options.transactionId - Transaction ID for error reporting.
 */
function validateRelayRateDrift({
  originalQuote,
  discoveryQuote,
  transactionId,
}: {
  originalQuote: RelayQuote;
  discoveryQuote: RelayQuote;
  transactionId: string;
}): void {
  const originalIn = new BigNumber(originalQuote.details.currencyIn.amountUsd);
  const originalOut = new BigNumber(
    originalQuote.details.currencyOut.amountUsd,
  );
  const discoveryIn = new BigNumber(
    discoveryQuote.details.currencyIn.amountUsd,
  );
  const discoveryOut = new BigNumber(
    discoveryQuote.details.currencyOut.amountUsd,
  );

  if (
    !originalIn.gt(0) ||
    !originalOut.gt(0) ||
    !discoveryIn.gt(0) ||
    !discoveryOut.gt(0)
  ) {
    return;
  }

  const originalRate = originalOut.dividedBy(originalIn);
  const discoveryRate = discoveryOut.dividedBy(discoveryIn);

  const driftPercent = originalRate
    .minus(discoveryRate)
    .dividedBy(originalRate)
    .multipliedBy(100);

  log('Relay rate drift check', {
    originalRate: originalRate.toFixed(6),
    discoveryRate: discoveryRate.toFixed(6),
    driftPercent: driftPercent.toFixed(2),
    transactionId,
  });

  if (driftPercent.gt(MAX_RATE_DRIFT_PERCENT)) {
    throw new Error(
      `Relay rate drift too high for transaction ` +
        `${driftPercent.toFixed(2)}% exceeds ${MAX_RATE_DRIFT_PERCENT}% max`,
    );
  }
}
