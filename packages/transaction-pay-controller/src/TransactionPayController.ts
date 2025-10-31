import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Draft } from 'immer';
import { noop } from 'lodash';

import { updatePaymentToken } from './actions/update-payment-token';
import { CONTROLLER_NAME, TransactionPayStrategy } from './constants';
import { QuoteRefresher } from './helpers/QuoteRefresher';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  UpdatePaymentTokenRequest,
} from './types';
import { updateQuotes } from './utils/quotes';
import { updateSourceAmounts } from './utils/source-amounts';
import { pollTransactionChanges } from './utils/transaction';

const stateMetadata: StateMetadata<TransactionPayControllerState> = {
  transactionData: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
};

const getDefaultState = () => ({
  transactionData: {},
});

export class TransactionPayController extends BaseController<
  typeof CONTROLLER_NAME,
  TransactionPayControllerState,
  TransactionPayControllerMessenger
> {
  readonly #getStrategy?: (
    transaction: TransactionMeta,
  ) => Promise<TransactionPayStrategy>;

  constructor({
    getStrategy,
    messenger,
    state,
  }: TransactionPayControllerOptions) {
    super({
      name: CONTROLLER_NAME,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.#getStrategy = getStrategy;

    this.#registerActionHandlers();

    pollTransactionChanges(
      messenger,
      this.#updateTransactionData.bind(this),
      this.#removeTransactionData.bind(this),
    );

    new QuoteRefresher({
      messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  updatePaymentToken(request: UpdatePaymentTokenRequest) {
    updatePaymentToken(request, {
      messenger: this.messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  #removeTransactionData(transactionId: string) {
    this.update((state) => {
      delete state.transactionData[transactionId];
    });
  }

  #updateTransactionData(
    transactionId: string,
    fn: (transactionData: Draft<TransactionData>) => void,
  ) {
    let shouldUpdateQuotes = false;

    this.update((state) => {
      const { transactionData } = state;
      let current = transactionData[transactionId];
      const originalPaymentToken = current?.paymentToken;
      const originalTokens = current?.tokens;

      if (!current) {
        transactionData[transactionId] = {
          isLoading: false,
          tokens: [],
        };

        current = transactionData[transactionId];
      }

      fn(current);

      const isPaymentTokenUpdated =
        current.paymentToken !== originalPaymentToken;

      const isTokensUpdated = current.tokens !== originalTokens;

      if (isPaymentTokenUpdated || isTokensUpdated) {
        updateSourceAmounts(transactionId, current as never, this.messenger);

        shouldUpdateQuotes = true;
        current.isLoading = true;
      }
    });

    if (shouldUpdateQuotes) {
      updateQuotes({
        messenger: this.messenger,
        transactionData: this.state.transactionData[transactionId],
        transactionId,
        updateTransactionData: this.#updateTransactionData.bind(this),
      }).catch(noop);
    }
  }

  #registerActionHandlers() {
    this.messenger.registerActionHandler(
      'TransactionPayController:getStrategy',
      this.#getStrategy ?? (async () => TransactionPayStrategy.Relay),
    );

    this.messenger.registerActionHandler(
      'TransactionPayController:updatePaymentToken',
      this.updatePaymentToken.bind(this),
    );
  }
}
