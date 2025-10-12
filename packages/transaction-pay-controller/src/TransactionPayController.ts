import { BaseController } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import type { Draft } from 'immer';
import { noop } from 'lodash';

import { updatePaymentToken } from './actions/update-payment-token';
import { CONTROLLER_NAME, TransactionPayStrategy } from './constants';
import { projectLogger } from './logger';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
} from './types';
import { updateQuotes } from './utils/bridge-quotes';
import { updateSourceAmounts } from './utils/source-amounts';
import { pollTransactionChanges } from './utils/transaction';

const stateMetadata = {
  transactionData: { persist: false, anonymous: false },
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

    pollTransactionChanges(messenger, this.#updateTransactionData.bind(this));
  }

  updatePaymentToken({
    transactionId,
    tokenAddress,
    chainId,
  }: {
    transactionId: string;
    tokenAddress: Hex;
    chainId: Hex;
  }) {
    updatePaymentToken(
      { transactionId, tokenAddress, chainId },
      {
        messenger: this.messagingSystem,
        updateTransactionData: this.#updateTransactionData.bind(this),
      },
    );
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
        updateSourceAmounts(
          transactionId,
          current as never,
          this.messagingSystem,
        );

        shouldUpdateQuotes = true;
        current.isLoading = true;
      }
    });

    if (shouldUpdateQuotes) {
      updateQuotes({
        messenger: this.messagingSystem,
        transactionData: this.state.transactionData[transactionId],
        transactionId,
        updateTransactionData: this.#updateTransactionData.bind(this),
      }).catch(noop);
    }
  }

  #registerActionHandlers() {
    this.messagingSystem.registerActionHandler(
      'TransactionPayController:getStrategy',
      this.#getStrategy ?? (async () => TransactionPayStrategy.Bridge),
    );
  }
}
