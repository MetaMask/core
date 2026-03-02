import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { FiatOriginalQuote } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  QuoteRequest,
} from '../../types';
import { deriveFiatAssetForFiatPayment } from '../../utils/fiat';
import { getRelayQuotes } from '../relay/relay-quotes';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote } from '../relay/types';

const log = createModuleLogger(projectLogger, 'fiat-submit');
const ORDER_POLL_INTERVAL_MS = 1000;
const ORDER_POLL_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseQuickBuyOrderId(
  quickBuyOrderId: string,
): { orderCode: string; providerCode: string } | null {
  const parts = quickBuyOrderId.split('/').filter(Boolean);

  if (parts.length < 4 || parts[0] !== 'providers' || parts[2] !== 'orders') {
    return null;
  }

  const providerCode = parts[1];
  const orderCode = parts[3];

  if (!providerCode || !orderCode) {
    return null;
  }

  return {
    orderCode,
    providerCode,
  };
}

type FiatOrder = {
  status?: string;
  cryptoAmount?: number | string;
  cryptoCurrency?: {
    assetId?: string;
    chainId?: string;
    decimals?: number;
  };
};

function getRawSourceAmountFromOrder({
  cryptoAmount,
  decimals,
}: {
  cryptoAmount: string | number | undefined;
  decimals: number;
}): string {
  const normalizedAmount = new BigNumber(String(cryptoAmount ?? ''));

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

function validateOrderAsset({
  fiatAssetCaipAssetId,
  order,
  transactionId,
}: {
  fiatAssetCaipAssetId: string;
  order: FiatOrder;
  transactionId: string;
}): void {
  const orderAssetId = order.cryptoCurrency?.assetId?.toLowerCase();
  const expectedAssetId = fiatAssetCaipAssetId.toLowerCase();
  const expectedChainId = expectedAssetId.split('/')[0];
  const orderChainId = order.cryptoCurrency?.chainId?.toLowerCase();

  if (orderAssetId && orderAssetId !== expectedAssetId) {
    throw new Error(
      `Fiat order asset mismatch for transaction ${transactionId}: expected ${expectedAssetId}, got ${orderAssetId}`,
    );
  }

  if (orderChainId && orderChainId !== expectedChainId) {
    throw new Error(
      `Fiat order chain mismatch for transaction ${transactionId}: expected ${expectedChainId}, got ${orderChainId}`,
    );
  }
}

async function submitRelayAfterFiatCompletion({
  request,
  order,
}: {
  request: PayStrategyExecuteRequest<FiatOriginalQuote>;
  order: FiatOrder;
}): Promise<{ transactionHash?: Hex }> {
  const { transaction, messenger, quotes } = request;
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
      `Missing fiat asset mapping for transaction type: ${transaction.type}`,
    );
  }

  validateOrderAsset({
    fiatAssetCaipAssetId: fiatAsset.caipAssetId,
    order,
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
    relayQuotes: relayQuotes.map((quote) => ({
      request: quote.request,
      sourceAmount: quote.sourceAmount,
      strategy: quote.strategy,
      targetAmount: quote.targetAmount,
    })),
    transactionId,
  });

  const relaySubmitRequest: PayStrategyExecuteRequest<RelayQuote> = {
    isSmartTransaction: request.isSmartTransaction,
    messenger,
    quotes: relayQuotes,
    transaction,
  };

  const relaySubmitResult = await submitRelayQuotes(relaySubmitRequest);

  log('Relay submission completed after fiat completion', {
    relaySubmitResult,
    transactionId,
  });

  return relaySubmitResult;
}

/**
 * Submit Fiat quotes.
 *
 * @param request - Strategy execute request.
 * @returns Empty transaction hash until fiat implementation is added.
 */
export async function submitFiatQuotes(
  request: PayStrategyExecuteRequest<FiatOriginalQuote>,
): ReturnType<PayStrategy<FiatOriginalQuote>['execute']> {
  const { messenger, transaction } = request;
  const transactionId = transaction.id;
  const walletAddress = transaction.txParams.from as Hex | undefined;

  if (!walletAddress) {
    throw new Error('Missing wallet address for fiat submission');
  }

  const state = messenger.call('TransactionPayController:getState');
  const quickBuyOrderId =
    state.transactionData[transactionId]?.fiatPayment?.quickBuyOrderId;

  if (!quickBuyOrderId) {
    throw new Error('Missing quick buy order ID for fiat submission');
  }

  const parsedOrderId = parseQuickBuyOrderId(quickBuyOrderId);

  if (!parsedOrderId) {
    throw new Error(`Invalid quick buy order ID format: ${quickBuyOrderId}`);
  }

  const timeoutAt = Date.now() + ORDER_POLL_TIMEOUT_MS;

  while (Date.now() < timeoutAt) {
    const order = (await messenger.call(
      'RampsController:getOrder',
      parsedOrderId.providerCode,
      parsedOrderId.orderCode,
      walletAddress,
    )) as FiatOrder;

    if (order?.status === 'COMPLETED') {
      log('Fiat order completed', {
        order,
        quickBuyOrderId,
        transactionId,
      });

      return await submitRelayAfterFiatCompletion({
        request,
        order,
      });
    }

    if (order?.status === 'FAILED' || order?.status === 'CANCELLED') {
      log('Fiat order failed', {
        order,
        quickBuyOrderId,
        transactionId,
      });
      throw new Error(`Fiat order ${order.status.toLowerCase()}`);
    }

    await sleep(ORDER_POLL_INTERVAL_MS);
  }

  log('Fiat order polling timed out', {
    quickBuyOrderId,
    transactionId,
  });

  throw new Error('Timed out waiting for fiat order completion');
}
