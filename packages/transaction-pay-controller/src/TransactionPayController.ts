import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Draft } from 'immer';
import { noop } from 'lodash';

import { updateFiatPayment } from './actions/update-fiat-payment';
import { updatePaymentToken } from './actions/update-payment-token';
import {
  CONTROLLER_NAME,
  isTransactionPayStrategy,
  TransactionPayStrategy,
} from './constants';
import { QuoteRefresher } from './helpers/QuoteRefresher';
import type {
  GetDelegationTransactionCallback,
  TransactionConfigCallback,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  UpdateFiatPaymentRequest,
  UpdatePaymentTokenRequest,
} from './types';
import { getStrategyOrder } from './utils/feature-flags';
import { updateQuotes } from './utils/quotes';
import { updateSourceAmounts } from './utils/source-amounts';
import { pollTransactionChanges } from './utils/transaction';

const MESSENGER_EXPOSED_METHODS = [
  'getDelegationTransaction',
  'getStrategy',
  'setTransactionConfig',
  'updateFiatPayment',
  'updatePaymentToken',
] as const;

const stateMetadata: StateMetadata<TransactionPayControllerState> = {
  transactionData: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
};

const getDefaultState = (): TransactionPayControllerState => ({
  transactionData: {},
});

export class TransactionPayController extends BaseController<
  typeof CONTROLLER_NAME,
  TransactionPayControllerState,
  TransactionPayControllerMessenger
> {
  readonly #getDelegationTransaction: GetDelegationTransactionCallback;

  readonly #getStrategy?: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy;

  readonly #getStrategies?: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy[];

  constructor({
    getDelegationTransaction,
    getStrategy,
    getStrategies,
    messenger,
    state,
  }: TransactionPayControllerOptions) {
    super({
      name: CONTROLLER_NAME,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.#getDelegationTransaction = getDelegationTransaction;
    this.#getStrategy = getStrategy;
    this.#getStrategies = getStrategies;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    pollTransactionChanges(
      messenger,
      this.#updateTransactionData.bind(this),
      this.#removeTransactionData.bind(this),
    );

    // eslint-disable-next-line no-new
    new QuoteRefresher({
      getStrategies: this.#getStrategiesWithFallback.bind(this),
      messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  /**
   * Sets the transaction configuration.
   *
   * The callback receives the current configuration properties and can mutate
   * them in place. Updated values are written back to the transaction data.
   *
   * @param transactionId - The ID of the transaction to configure.
   * @param callback - A callback that receives a mutable {@link TransactionConfig} object.
   */
  setTransactionConfig(
    transactionId: string,
    callback: TransactionConfigCallback,
  ): void {
    this.#updateTransactionData(transactionId, (transactionData) => {
      const config = {
        isMaxAmount: transactionData.isMaxAmount,
        isPostQuote: transactionData.isPostQuote,
        refundTo: transactionData.refundTo,
      };

      callback(config);

      transactionData.isMaxAmount = config.isMaxAmount;
      transactionData.isPostQuote = config.isPostQuote;
      transactionData.refundTo = config.refundTo;
    });
  }

  /**
   * Updates the payment token for a transaction.
   *
   * Resolves token metadata and balances, then stores the new payment token
   * in the transaction data. This triggers recalculation of source amounts
   * and quote retrieval.
   *
   * @param request - The payment token update request containing the
   * transaction ID, token address, and chain ID.
   */
  updatePaymentToken(request: UpdatePaymentTokenRequest): void {
    updatePaymentToken(request, {
      messenger: this.messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  /**
   * Updates the fiat payment state for a transaction.
   *
   * The request callback receives the current fiat payment state and can
   * mutate it to update properties such as the selected payment method or
   * fiat amount.
   *
   * @param request - The fiat payment update request containing the
   * transaction ID and a callback to mutate fiat payment state.
   */
  updateFiatPayment(request: UpdateFiatPaymentRequest): void {
    updateFiatPayment(request, {
      messenger: this.messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  /**
   * Gets the delegation transaction for a given transaction.
   *
   * Converts the provided transaction into a redeem delegation by delegating
   * to the configured callback. Returns the delegation transaction data
   * including the encoded call data, target address, value, and an optional
   * authorization list.
   *
   * @param args - The arguments forwarded to the {@link GetDelegationTransactionCallback},
   * containing the transaction metadata.
   * @returns A promise resolving to the delegation transaction data.
   */
  getDelegationTransaction(
    ...args: Parameters<GetDelegationTransactionCallback>
  ): ReturnType<GetDelegationTransactionCallback> {
    return this.#getDelegationTransaction(...args);
  }

  /**
   * Gets the preferred strategy for a transaction.
   *
   * Returns the first strategy from the ordered list of strategies applicable
   * to the given transaction. Falls back to the default strategy order derived
   * from feature flags when no custom strategy callback is configured.
   *
   * @param transaction - The transaction metadata to determine the strategy for.
   * @returns The preferred {@link TransactionPayStrategy} for the transaction.
   */
  getStrategy(transaction: TransactionMeta): TransactionPayStrategy {
    return this.#getStrategiesWithFallback(transaction)[0];
  }

  #removeTransactionData(transactionId: string): void {
    this.update((state) => {
      delete state.transactionData[transactionId];
    });
  }

  #updateTransactionData(
    transactionId: string,
    fn: (transactionData: Draft<TransactionData>) => void,
  ): void {
    let shouldUpdateQuotes = false;

    this.update((state) => {
      const { transactionData } = state;
      let current = transactionData[transactionId];
      const originalPaymentToken = current?.paymentToken;
      const originalTokens = current?.tokens;
      const originalIsMaxAmount = current?.isMaxAmount;
      const originalIsPostQuote = current?.isPostQuote;

      if (!current) {
        transactionData[transactionId] = {
          fiatPayment: {},
          isLoading: false,
          tokens: [],
        };

        current = transactionData[transactionId];
      }

      fn(current);

      const isPaymentTokenUpdated =
        current.paymentToken?.address?.toLowerCase() !==
          originalPaymentToken?.address?.toLowerCase() ||
        current.paymentToken?.chainId !== originalPaymentToken?.chainId;

      const isTokensUpdated = current.tokens !== originalTokens;
      const isIsMaxUpdated = current.isMaxAmount !== originalIsMaxAmount;
      const isPostQuoteUpdated = current.isPostQuote !== originalIsPostQuote;

      if (
        isPaymentTokenUpdated ||
        isIsMaxUpdated ||
        isTokensUpdated ||
        isPostQuoteUpdated
      ) {
        updateSourceAmounts(transactionId, current as never, this.messenger);

        shouldUpdateQuotes = true;
      }
    });

    if (shouldUpdateQuotes) {
      updateQuotes({
        getStrategies: this.#getStrategiesWithFallback.bind(this),
        messenger: this.messenger,
        transactionData: this.state.transactionData[transactionId],
        transactionId,
        updateTransactionData: this.#updateTransactionData.bind(this),
      }).catch(noop);
    }
  }

  #getStrategiesWithFallback(
    transaction: TransactionMeta,
  ): TransactionPayStrategy[] {
    const strategyCandidates: unknown[] =
      this.#getStrategies?.(transaction) ??
      (this.#getStrategy ? [this.#getStrategy(transaction)] : []);

    const validStrategies = strategyCandidates.filter(
      (strategy): strategy is TransactionPayStrategy =>
        isTransactionPayStrategy(strategy),
    );

    return validStrategies.length
      ? validStrategies
      : getStrategyOrder(this.messenger);
  }
}
