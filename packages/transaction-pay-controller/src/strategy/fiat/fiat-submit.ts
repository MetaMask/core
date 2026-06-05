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
import { updateTransaction } from '../../utils/transaction';
import { getRelayQuotes } from '../relay/relay-quotes';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote } from '../relay/types';
import type { TransactionPayFiatAsset } from './constants';
import type { FiatQuote } from './types';
import { deriveFiatAssetForFiatPayment, resolveSourceAmountRaw } from './utils';

const log = createModuleLogger(projectLogger, 'fiat-submit');

const ORDER_POLL_INTERVAL_MS = 1000;
const ORDER_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SLIPPAGE_PERCENT = 5;

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
  const walletAddress = transaction.txParams.from as Hex | undefined;

  if (!walletAddress) {
    throw new Error('Missing wallet address for fiat submission');
  }

  const state = messenger.call('TransactionPayController:getState');
  const fiatPayment = state.transactionData[transactionId]?.fiatPayment;
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
 * Validates that the re-quoted relay target output hasn't drifted beyond the
 * acceptable slippage threshold compared to the original quote shown to the user.
 *
 * @param options - The validation options.
 * @param options.originalTargetRaw - Raw target amount from the original relay quote.
 * @param options.reQuotedTargetRaw - Raw target amount from the re-quoted relay.
 * @param options.transactionId - Transaction ID for error reporting.
 */
function validateRelaySlippage({
  originalTargetRaw,
  reQuotedTargetRaw,
  transactionId,
}: {
  originalTargetRaw: string;
  reQuotedTargetRaw: string;
  transactionId: string;
}): void {
  const original = new BigNumber(originalTargetRaw);
  const reQuoted = new BigNumber(reQuotedTargetRaw);

  if (!original.gt(0) || !reQuoted.gt(0)) {
    return;
  }

  const slippagePercent = original
    .minus(reQuoted)
    .dividedBy(original)
    .multipliedBy(100);

  log('Relay slippage check', {
    originalTargetRaw,
    reQuotedTargetRaw,
    slippagePercent: slippagePercent.toFixed(2),
    transactionId,
  });

  if (slippagePercent.gt(MAX_SLIPPAGE_PERCENT)) {
    throw new Error(
      `Relay re-quote slippage too high for transaction ` +
        `${slippagePercent.toFixed(2)}% exceeds ${MAX_SLIPPAGE_PERCENT}% max`,
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

  const walletAddress = transaction.txParams.from as Hex;

  const sourceAmountRaw = await resolveSourceAmountRaw({
    messenger,
    order,
    fiatAsset,
    walletAddress,
  });

  const baseRequest = quotes[0].request;
  const relayRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: true,
    isPostQuote: false,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
  };

  log('Re-quoting relay from completed fiat order', {
    completedOrderAmount: order.cryptoAmount,
    relayRequest,
    sourceAmountRaw,
    transactionId,
  });

  const relayQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    messenger,
    requests: [relayRequest],
    transaction,
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  const originalRelayQuote = quotes[0].original.relayQuote;
  validateRelaySlippage({
    originalTargetRaw: originalRelayQuote.details.currencyOut.amount,
    reQuotedTargetRaw: relayQuotes[0].original.details.currencyOut.amount,
    transactionId,
  });

  log('Received relay quotes for completed fiat order', {
    relayQuoteCount: relayQuotes.length,
    transactionId,
  });

  const relaySubmitRequest: PayStrategyExecuteRequest<RelayQuote> = {
    accountSupports7702: request.accountSupports7702,
    isSmartTransaction: request.isSmartTransaction,
    messenger,
    quotes: relayQuotes,
    transaction,
  };

  const relayResult = await submitRelayQuotes(relaySubmitRequest);

  log('Relay submission completed after fiat order', {
    relayResult,
    transactionId,
  });

  return relayResult;
}
