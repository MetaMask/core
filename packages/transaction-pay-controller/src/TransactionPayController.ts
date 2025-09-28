import { BaseController } from '@metamask/base-controller';
import type { Hex } from '@metamask/utils';
import { noop } from 'lodash';

import { updatePaymentToken } from './actions/update-payment-token';
import { projectLogger } from './logger';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  TransactionPaymentToken,
} from './types';
import { controllerName } from './types';
import { updateQuotes } from './utils/bridge-quotes';
import { updateSourceAmounts } from './utils/source-amounts';
import { pollTransactionChanges } from './utils/transaction';

const stateMetadata = {
  transactionData: { persist: false, anonymous: false },
};

const getDefaultState = () => ({
  transactionData: {},
});

const log = projectLogger;

export class TransactionPayController extends BaseController<
  typeof controllerName,
  TransactionPayControllerState,
  TransactionPayControllerMessenger
> {
  constructor({ messenger, state }: TransactionPayControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

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
    fn: (transactionData: TransactionData) => void,
  ) {
    let shouldUpdateQuotes = false;

    this.update((state) => {
      const { transactionData } = state;
      let current = transactionData[transactionId];
      const originalPaymentToken = current?.paymentToken;
      const originalTokens = current?.tokens;

      if (!current) {
        transactionData[transactionId] = {
          tokens: [],
        } as TransactionData;

        current = transactionData[transactionId];
      }

      fn(current);

      const isPaymentTokenUpdated =
        current.paymentToken !== originalPaymentToken;

      const isTokensUpdated = current.tokens !== originalTokens;

      if (isPaymentTokenUpdated || isTokensUpdated) {
        updateSourceAmounts(transactionId, current, this.messagingSystem);
        shouldUpdateQuotes = true;
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
}
