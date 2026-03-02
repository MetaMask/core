import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { FiatOriginalQuote } from './types';
import { projectLogger } from '../../logger';
import type { PayStrategy, PayStrategyExecuteRequest } from '../../types';

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
    const order = await messenger.call(
      'RampsController:getOrder',
      parsedOrderId.providerCode,
      parsedOrderId.orderCode,
      walletAddress,
    );

    if (order?.status === 'COMPLETED') {
      log('Fiat order completed', {
        order,
        quickBuyOrderId,
        transactionId,
      });
      return { transactionHash: undefined };
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
