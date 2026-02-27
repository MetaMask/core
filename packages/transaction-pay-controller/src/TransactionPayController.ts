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
  MMPAY_FIAT_ASSET_ID_BY_TX_TYPE,
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
import { getTransaction, pollTransactionChanges } from './utils/transaction';

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
    transactionData?: TransactionData,
  ) => TransactionPayStrategy;

  readonly #getStrategies?: (
    transaction: TransactionMeta,
    transactionData?: TransactionData,
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

    this.#registerActionHandlers();

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

  setTransactionConfig(
    transactionId: string,
    callback: TransactionConfigCallback,
  ): void {
    this.#updateTransactionData(transactionId, (transactionData) => {
      const config = {
        isMaxAmount: transactionData.isMaxAmount,
        isPostQuote: transactionData.isPostQuote,
      };

      callback(config);

      transactionData.isMaxAmount = config.isMaxAmount;
      transactionData.isPostQuote = config.isPostQuote;
    });
  }

  updatePaymentToken(request: UpdatePaymentTokenRequest): void {
    updatePaymentToken(request, {
      messenger: this.messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  updateFiatPayment(request: UpdateFiatPaymentRequest): void {
    updateFiatPayment(request, {
      messenger: this.messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
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
    let fiatAssetId: string | undefined;

    this.update((state) => {
      const { transactionData } = state;
      let current = transactionData[transactionId];
      const originalPaymentToken = current?.paymentToken;
      const originalTokens = current?.tokens;
      const originalIsMaxAmount = current?.isMaxAmount;
      const originalIsPostQuote = current?.isPostQuote;

      if (!current) {
        transactionData[transactionId] = {
          fiatPayment: {
            selectedPaymentMethodId: null,
          },
          isLoading: false,
          tokens: [],
        };

        const transaction = getTransaction(transactionId, this.messenger);
        fiatAssetId = transaction?.type
          ? MMPAY_FIAT_ASSET_ID_BY_TX_TYPE[transaction.type]
          : undefined;

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

      if (fiatAssetId) {
        this.messenger.call('RampsController:setSelectedToken', fiatAssetId);
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

  #registerActionHandlers(): void {
    this.messenger.registerActionHandler(
      'TransactionPayController:getDelegationTransaction',
      this.#getDelegationTransaction.bind(this),
    );

    this.messenger.registerActionHandler(
      'TransactionPayController:getStrategy',
      (transaction: TransactionMeta): TransactionPayStrategy =>
        this.#getStrategiesWithFallback(transaction)[0],
    );

    this.messenger.registerActionHandler(
      'TransactionPayController:setTransactionConfig',
      this.setTransactionConfig.bind(this),
    );

    this.messenger.registerActionHandler(
      'TransactionPayController:updatePaymentToken',
      this.updatePaymentToken.bind(this),
    );

    this.messenger.registerActionHandler(
      'TransactionPayController:updateFiatPayment',
      this.updateFiatPayment.bind(this),
    );
  }

  #getStrategiesWithFallback(
    transaction: TransactionMeta,
  ): TransactionPayStrategy[] {
    const transactionData = transaction.id
      ? this.state.transactionData[transaction.id]
      : undefined;

    const strategyCandidates: unknown[] =
      this.#getStrategies?.(transaction, transactionData) ??
      (this.#getStrategy
        ? [this.#getStrategy(transaction, transactionData)]
        : []);

    const validStrategies = strategyCandidates.filter(
      (strategy): strategy is TransactionPayStrategy =>
        isTransactionPayStrategy(strategy),
    );

    return validStrategies.length
      ? validStrategies
      : getStrategyOrder(this.messenger);
  }
}
