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
  GetAmountDataCallback,
  GetDelegationTransactionCallback,
  GetPaymentOverrideDataCallback,
  PolymarketCallbacks,
  TransactionConfigCallback,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayFiatOptions,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  UpdateFiatPaymentRequest,
  UpdatePaymentTokenRequest,
} from './types';
import { getStrategyOrder } from './utils/feature-flags';
import { updateQuotes } from './utils/quotes';
import { updateSourceAmounts } from './utils/source-amounts';
import {
  subscribeAssetChanges,
  subscribeTransactionChanges,
} from './utils/transaction';

const MESSENGER_EXPOSED_METHODS = [
  'getAmountData',
  'getDelegationTransaction',
  'getFiatOptions',
  'getPaymentOverrideData',
  'getStrategy',
  'polymarketGetDepositWalletAddress',
  'polymarketSubmitDepositWalletBatch',
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
  readonly #getAmountData?: GetAmountDataCallback;

  readonly #getDelegationTransaction: GetDelegationTransactionCallback;

  readonly #fiatOptions?: TransactionPayFiatOptions;

  readonly #getPaymentOverrideData?: GetPaymentOverrideDataCallback;

  readonly #getStrategy?: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy;

  readonly #getStrategies?: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy[];

  readonly #polymarket?: PolymarketCallbacks;

  constructor({
    fiatOptions,
    getAmountData,
    getDelegationTransaction,
    getPaymentOverrideData,
    getStrategy,
    getStrategies,
    messenger,
    polymarket,
    state,
  }: TransactionPayControllerOptions) {
    super({
      name: CONTROLLER_NAME,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.#getAmountData = getAmountData;
    this.#getDelegationTransaction = getDelegationTransaction;
    this.#fiatOptions = fiatOptions;
    this.#getPaymentOverrideData = getPaymentOverrideData;
    this.#getStrategy = getStrategy;
    this.#getStrategies = getStrategies;
    this.#polymarket = polymarket;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    subscribeTransactionChanges(
      messenger,
      this.#updateTransactionData.bind(this),
      this.#removeTransactionData.bind(this),
    );

    subscribeAssetChanges(
      messenger,
      () => this.state,
      this.#updateTransactionData.bind(this),
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
        isHyperliquidSource: transactionData.isHyperliquidSource,
        isPolymarketDepositWallet: transactionData.isPolymarketDepositWallet,
        isQuoteRequired: transactionData.isQuoteRequired,
        refundTo: transactionData.refundTo,
        accountOverride: transactionData.accountOverride,
        paymentOverride: transactionData.paymentOverride,
      };

      const previousAccountOverride = config.accountOverride;

      callback(config);

      transactionData.accountOverride = config.accountOverride;
      transactionData.isMaxAmount = config.isMaxAmount;
      transactionData.isPostQuote = config.isPostQuote;
      transactionData.isHyperliquidSource = config.isHyperliquidSource;
      transactionData.isPolymarketDepositWallet =
        config.isPolymarketDepositWallet;
      transactionData.isQuoteRequired = config.isQuoteRequired;
      transactionData.refundTo = config.refundTo;
      transactionData.paymentOverride = config.paymentOverride;

      if (
        !config.isPostQuote &&
        config.accountOverride !== previousAccountOverride
      ) {
        transactionData.paymentToken = undefined;
      }
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
   * Returns additional transactions for the paymentOverride flow.
   *
   * Delegates to the client-supplied {@link GetPaymentOverrideDataCallback}.
   * Called during quote execution when `paymentOverride` is defined on the transaction.
   * Returns an empty array when no callback is configured.
   *
   * @param args - The arguments forwarded to the {@link GetPaymentOverrideDataCallback}.
   * @returns A promise resolving to the additional transactions array.
   */
  getAmountData(
    ...args: Parameters<GetAmountDataCallback>
  ): ReturnType<GetAmountDataCallback> {
    return this.#getAmountData?.(...args) ?? Promise.resolve({ updates: [] });
  }

  /**
   * Returns optional fiat execution configuration.
   *
   * This is intentionally not stored in controller state.
   *
   * @returns Fiat execution options, if configured.
   */
  getFiatOptions(): TransactionPayFiatOptions | undefined {
    return this.#fiatOptions;
  }

  getPaymentOverrideData(
    ...args: Parameters<GetPaymentOverrideDataCallback>
  ): ReturnType<GetPaymentOverrideDataCallback> {
    return (
      this.#getPaymentOverrideData?.(...args) ?? Promise.resolve({ calls: [] })
    );
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

  /**
   * Derives the Polymarket deposit-wallet address for an EOA via the
   * client-supplied callback.
   *
   * @param args - The arguments forwarded to {@link PolymarketCallbacks.getDepositWalletAddress}.
   * @returns A promise resolving to the deposit-wallet address.
   */
  polymarketGetDepositWalletAddress(
    ...args: Parameters<PolymarketCallbacks['getDepositWalletAddress']>
  ): ReturnType<PolymarketCallbacks['getDepositWalletAddress']> {
    return this.#requirePolymarket().getDepositWalletAddress(...args);
  }

  /**
   * Signs and broadcasts a Polymarket deposit-wallet batch via the
   * client-supplied callback.
   *
   * @param args - The arguments forwarded to {@link PolymarketCallbacks.submitDepositWalletBatch}.
   * @returns A promise resolving to the relayer-issued source hash.
   */
  polymarketSubmitDepositWalletBatch(
    ...args: Parameters<PolymarketCallbacks['submitDepositWalletBatch']>
  ): ReturnType<PolymarketCallbacks['submitDepositWalletBatch']> {
    return this.#requirePolymarket().submitDepositWalletBatch(...args);
  }

  #requirePolymarket(): PolymarketCallbacks {
    if (!this.#polymarket) {
      throw new Error('TransactionPayController: Polymarket callbacks missing');
    }
    return this.#polymarket;
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
      const originalAccountOverride = current?.accountOverride;
      const originalFiatPaymentAmount = current?.fiatPayment?.amountFiat;
      const originalFiatPaymentMethodId =
        current?.fiatPayment?.selectedPaymentMethodId;

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
      const isAccountOverrideUpdated =
        current.accountOverride !== originalAccountOverride;
      const isFiatAmountUpdated =
        current.fiatPayment?.amountFiat !== originalFiatPaymentAmount;
      const isFiatPaymentMethodUpdated =
        current.fiatPayment?.selectedPaymentMethodId !==
        originalFiatPaymentMethodId;

      if (
        isPaymentTokenUpdated ||
        isIsMaxUpdated ||
        isTokensUpdated ||
        isPostQuoteUpdated ||
        isAccountOverrideUpdated
      ) {
        updateSourceAmounts(transactionId, current as never, this.messenger);

        shouldUpdateQuotes = true;
      }

      if (isFiatAmountUpdated || isFiatPaymentMethodUpdated) {
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
    const transactionData = this.state.transactionData[transaction.id];

    const strategyCandidates: unknown[] =
      this.#getStrategies?.(transaction) ??
      (this.#getStrategy ? [this.#getStrategy(transaction)] : []);

    const validStrategies = strategyCandidates.filter(
      (strategy): strategy is TransactionPayStrategy =>
        isTransactionPayStrategy(strategy),
    );

    if (validStrategies.length) {
      return validStrategies;
    }

    const paymentToken = transactionData?.paymentToken;

    return getStrategyOrder(
      this.messenger,
      paymentToken?.chainId,
      paymentToken?.address,
      transaction.type,
      transactionData?.fiatPayment?.selectedPaymentMethodId,
    );
  }
}
