import type { FiatQuote } from './types';
import type {
  RampsOrder,
  RampsOrderCryptoCurrency,
} from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionPayFiatAsset } from './constants';
import type { FiatQuote } from './types';
import { deriveFiatAssetForFiatPayment } from './utils';
import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types';
import { getRelayQuotes } from '../relay/relay-quotes';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote } from '../relay/types';

const log = createModuleLogger(projectLogger, 'fiat-submit');

const ORDER_POLL_INTERVAL_MS = 1000;
const ORDER_POLL_TIMEOUT_MS = 10 * 60 * 1000;

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
  const orderCode =
    state.transactionData[transactionId]?.fiatPayment?.orderCode;

  if (!orderCode) {
    throw new Error('Missing order code for fiat submission');
  }

  const parsedOrderCode = parseOrderCode(orderCode);

  if (!parsedOrderCode) {
    throw new Error(`Invalid order code format: ${orderCode}`);
  }

  log('Starting fiat order polling', {
    orderCode,
    providerCode: parsedOrderCode.providerCode,
    transactionId,
  });

  const order = await waitForOrderCompletion({
    messenger,
    orderCode: parsedOrderCode.orderCode,
    providerCode: parsedOrderCode.providerCode,
    transactionId,
    walletAddress,
  });

  log('Fiat order completed', {
    cryptoAmount: order.cryptoAmount,
    orderCode,
    transactionId,
  });

  return await submitRelayAfterFiatCompletion({ order, request });
}

/**
 * Parses a normalized order code string into its provider and order components.
 *
 * @param orderCode - Order code in `/providers/{providerCode}/orders/{orderCode}` format.
 * @returns The parsed provider and order codes, or `null` if the format is invalid.
 */
function parseOrderCode(
  orderCode: string,
): { orderCode: string; providerCode: string } | null {
  const parts = orderCode.split('/').filter(Boolean);

  if (parts.length < 4 || parts[0] !== 'providers' || parts[2] !== 'orders') {
    return null;
  }

  return { orderCode: parts[3], providerCode: parts[1] };
}

/**
 * Converts the order's human-readable crypto amount to a raw token amount.
 *
 * @param options - The conversion options.
 * @param options.cryptoAmount - Human-readable crypto amount from the completed order.
 * @param options.decimals - Token decimals for the fiat asset.
 * @returns The raw token amount as a string.
 */
function getRawSourceAmountFromOrder({
  cryptoAmount,
  decimals,
}: {
  cryptoAmount: RampsOrder['cryptoAmount'];
  decimals: number;
}): string {
  const normalizedAmount = new BigNumber(String(cryptoAmount));

  if (!normalizedAmount.isFinite() || normalizedAmount.lte(0)) {
    throw new Error(
      `Invalid fiat order crypto amount: ${String(cryptoAmount)}`,
    );
  }

  const rawAmount = normalizedAmount
    .shiftedBy(decimals)
    .decimalPlaces(0, BigNumber.ROUND_DOWN)
    .toFixed(0);

  if (!new BigNumber(rawAmount).gt(0)) {
    throw new Error('Computed fiat order source amount is not positive');
  }

  return rawAmount;
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
  const expectedAssetId = expectedAsset.caipAssetId.toLowerCase();
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
    const order = await messenger.call(
      'RampsController:getOrder',
      providerCode,
      orderCode,
      walletAddress,
    );

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

    if (Date.now() - startTime >= ORDER_POLL_TIMEOUT_MS) {
      const statusDetail = lastStatus ? ` (last status: ${lastStatus})` : '';
      throw new Error(`Fiat order polling timed out${statusDetail}`);
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

  const fiatAsset = deriveFiatAssetForFiatPayment(transaction);
  if (!fiatAsset) {
    throw new Error(
      `Missing fiat asset mapping for transaction type: ${String(transaction.type)}`,
    );
  }

  validateOrderAsset({
    expectedAsset: fiatAsset,
    orderCrypto: order.cryptoCurrency,
    transactionId,
  });

  const sourceAmountRaw = getRawSourceAmountFromOrder({
    cryptoAmount: order.cryptoAmount,
    decimals: fiatAsset.decimals,
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
    messenger,
    requests: [relayRequest],
    transaction,
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  log('Received relay quotes for completed fiat order', {
    relayQuoteCount: relayQuotes.length,
    transactionId,
  });

  const relaySubmitRequest: PayStrategyExecuteRequest<RelayQuote> = {
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
