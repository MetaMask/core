import type { RampsOrder } from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  TransactionPayFiatOptions,
  TransactionPayControllerMessenger,
} from '../../types';
import { prefixError } from '../../utils/error-prefix';
import {
  getFiatOrderPollIntervalMs,
  getFiatOrderPollTimeoutMs,
} from '../../utils/feature-flags';
import { updateTransaction } from '../../utils/transaction';
import {
  isDirectMusdMoneyAccountQuote,
  submitDirectMusdAfterFiatCompletion,
} from './fiat-direct-musd';
import { submitSimpleRelay } from './fiat-submit-simple';
import { submitWithTransactionData } from './fiat-submit-with-transaction-data';
import { fundFiatOrderFromTestSource } from './fiat-test-funding';
import type { FiatQuote } from './types';
import {
  deriveFiatAssetForFiatPayment,
  extractProviderCode,
  resolveSourceAmountRaw,
  validateOrderAsset,
} from './utils';

const log = createModuleLogger(projectLogger, 'fiat-submit');
const POST_RAMP_ERROR_PREFIX = 'Post-Ramp: ';

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

  const walletAddress = getWalletAddress({
    quotes: request.quotes,
    transaction,
    accountOverride: transactionData?.accountOverride,
  });

  const fiatPayment = transactionData?.fiatPayment;
  const orderId = fiatPayment?.orderId;

  if (!orderId) {
    throw new Error('Missing order ID');
  }

  const providerCode = extractProviderCode(fiatPayment?.rampsQuote?.provider);

  if (!providerCode) {
    throw new Error('Missing provider code');
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

  const fiatQuote = request.quotes[0];

  if (!fiatQuote) {
    throw new Error('Missing quote');
  }

  const fiatOptions = getFiatOptions(messenger);

  const order = fiatOptions?.testFundingSource
    ? await fundFiatOrderFromTestSource({
        fiat: fiatOptions,
        messenger,
        quote: fiatQuote,
        transaction,
      })
    : await waitForOrderCompletion({
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

  try {
    await waitForKeyringUnlock(messenger, transactionId);

    const result = await submitRelayAfterFiatCompletion({
      order,
      request,
    });

    if (result.transactionHash === undefined) {
      throw new Error('Missing transaction hash');
    }

    return result;
  } catch (error) {
    throw prefixError(error, POST_RAMP_ERROR_PREFIX);
  }
}

function getFiatOptions(
  messenger: TransactionPayControllerMessenger,
): TransactionPayFiatOptions | undefined {
  try {
    return messenger.call('TransactionPayController:getFiatOptions');
  } catch (error) {
    log('Failed to retrieve fiat options', error);
    return undefined;
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
  const pollIntervalMs = getFiatOrderPollIntervalMs(messenger);
  const pollTimeoutMs = getFiatOrderPollTimeoutMs(messenger);
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

    if (Date.now() - startTime >= pollTimeoutMs) {
      throw new Error(
        `Fiat order polling timed out (last status: ${lastStatus})`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
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

  if (quotes.length > 1) {
    throw new Error('Multiple fiat quotes are not supported for submission');
  }

  const fiatQuote = quotes[0];
  const isDirectMusd = isDirectMusdMoneyAccountQuote(fiatQuote);

  if (isDirectMusd) {
    return await submitDirectMusdAfterFiatCompletion({
      order,
      request,
    });
  }

  const fiatAsset = deriveFiatAssetForFiatPayment(transaction, messenger);

  validateOrderAsset({
    expectedAsset: fiatAsset,
    orderCrypto: order.cryptoCurrency,
    transactionId,
  });

  const baseRequest = fiatQuote.request;

  const { amountRaw: sourceAmountRaw } = await resolveSourceAmountRaw({
    messenger,
    order,
    fiatAsset,
    walletAddress: baseRequest.from,
  });

  if (!fiatQuote.original.relayQuote) {
    throw new Error('Missing Relay quote');
  }

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

function getWalletAddress({
  quotes,
  transaction,
  accountOverride,
}: {
  quotes: PayStrategyExecuteRequest<FiatQuote>['quotes'];
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
  accountOverride: Hex | undefined;
}): Hex {
  const address = isDirectMusdMoneyAccountQuote(quotes[0])
    ? transaction.txParams.from
    : (accountOverride ?? transaction.txParams.from);

  if (!address) {
    throw new Error('Missing wallet address');
  }

  return address as Hex;
}

function waitForKeyringUnlock(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<void> {
  const { isUnlocked } = messenger.call('KeyringController:getState');

  if (isUnlocked) {
    return Promise.resolve();
  }

  log(
    'KeyringController is locked; waiting for unlock before fiat submit second leg',
    {
      transactionId,
    },
  );

  return new Promise((resolve) => {
    const handler = (): void => {
      messenger.unsubscribe('KeyringController:unlock', handler);

      log('KeyringController unlocked; resuming fiat submit second leg', {
        transactionId,
      });

      resolve();
    };

    messenger.subscribe('KeyringController:unlock', handler);
  });
}
