import type {
  RampsOrder,
  RampsOrderCryptoCurrency,
} from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
} from '../../types';
import { buildCaipAssetType } from '../../utils/token';
import { updateTransaction } from '../../utils/transaction';
import type { TransactionPayFiatAsset } from './constants';
import { MUSD_MONAD_FIAT_ASSET } from './constants';
import { submitSimpleRelay } from './fiat-submit-simple';
import { submitWithTransactionData } from './fiat-submit-with-transaction-data';
import type { FiatQuote } from './types';
import {
  deriveFiatAssetForFiatPayment,
  extractProviderCode,
  resolveSourceAmountRaw,
} from './utils';

const log = createModuleLogger(projectLogger, 'fiat-submit');

/**
 * Detects whether the given quotes originated from the direct mUSD-to-
 * Money-Account flow by inspecting the stored quote request's source
 * chain and token. This is more reliable than re-checking the feature
 * flag, which could change between quote and submit.
 *
 * @param quotes - The fiat quotes to inspect.
 * @returns `true` if the first quote targets mUSD on Monad as its source.
 */
function isDirectMusdToMoneyAccountQuote(
  quotes: PayStrategyExecuteRequest<FiatQuote>['quotes'],
): boolean {
  const request = quotes[0]?.request;
  return (
    request?.sourceChainId === MUSD_MONAD_FIAT_ASSET.chainId &&
    request?.sourceTokenAddress.toLowerCase() ===
      MUSD_MONAD_FIAT_ASSET.address.toLowerCase()
  );
}

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
  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];

  const isDirectMusdToMA = isDirectMusdToMoneyAccountQuote(request.quotes);

  // When the direct mUSD flow was used, the fiat provider delivered to
  // the money account (txParams.from), not to the user's override account.
  const walletAddress = (
    isDirectMusdToMA
      ? transaction.txParams.from
      : (transactionData?.accountOverride ?? transaction.txParams.from)
  ) as Hex | undefined;

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

  const isDirectMusdToMA = isDirectMusdToMoneyAccountQuote(quotes);
  const fiatAsset = isDirectMusdToMA
    ? MUSD_MONAD_FIAT_ASSET
    : deriveFiatAssetForFiatPayment(transaction, messenger);

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
    return await submitWithTransactionData({
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
