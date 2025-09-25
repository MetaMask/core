import { BaseController } from '@metamask/base-controller';
import type { Hex } from '@metamask/utils';

import { projectLogger } from './logger';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  TransactionPaymentToken,
} from './types';
import { controllerName } from './types';
import { getPaymentToken } from './utils/payment-token';
import { getTransaction, pollTransactionChanges } from './utils/transaction';

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
    const transaction = getTransaction(transactionId, this.messagingSystem);

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const paymentToken = getPaymentToken({
      chainId,
      from: transaction?.txParams.from as Hex,
      messenger: this.messagingSystem,
      tokenAddress,
    });

    if (!paymentToken) {
      throw new Error('Payment token not found');
    }

    this.#updateTransactionData(transactionId, (data) => {
      data.paymentToken = paymentToken;
    });
  }

  #updateTransactionData(
    transactionId: string,
    fn: (transactionData: TransactionData) => void,
  ) {
    this.update((state) => {
      const { transactionData } = state;
      const existing = transactionData[transactionId];

      if (!existing) {
        transactionData[transactionId] = {
          paymentToken: {} as TransactionPaymentToken,
          quotes: [],
          tokens: [],
        } as TransactionData;
      }

      fn(transactionData[transactionId]);

      log('Updated transaction data', {
        transactionId,
        data: transactionData[transactionId],
      });
    });
  }
}
