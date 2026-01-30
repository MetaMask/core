import type { PublishHook } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { PublishHookResult } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types';
import { getStrategy } from '../utils/strategy';
import { updateTransaction } from '../utils/transaction';

const log = createModuleLogger(projectLogger, 'pay-publish-hook');

const EMPTY_RESULT = {
  transactionHash: undefined,
};

export class TransactionPayPublishHook {
  readonly #isSmartTransaction: (chainId: Hex) => boolean;

  readonly #messenger: TransactionPayControllerMessenger;

  constructor({
    isSmartTransaction,
    messenger,
  }: {
    isSmartTransaction: (chainId: Hex) => boolean;
    messenger: TransactionPayControllerMessenger;
  }) {
    this.#isSmartTransaction = isSmartTransaction;
    this.#messenger = messenger;
  }

  getHook(): PublishHook {
    return this.#hookWrapper.bind(this);
  }

  async #hookWrapper(
    transactionMeta: TransactionMeta,
    _signedTx: string,
  ): Promise<PublishHookResult> {
    try {
      return await this.#publishHook(transactionMeta, _signedTx);
    } catch (error) {
      log('Error', error);
      throw error;
    }
  }

  async #publishHook(
    transactionMeta: TransactionMeta,
    _signedTx: string,
  ): Promise<PublishHookResult> {
    const { id: transactionId } = transactionMeta;

    const controllerState = this.#messenger.call(
      'TransactionPayController:getState',
    );

    const quotes =
      (controllerState.transactionData?.[transactionId]
        ?.quotes as TransactionPayQuote<unknown>[]) ?? [];

    if (!quotes?.length) {
      log('Skipping as no quotes found');
      return EMPTY_RESULT;
    }

    const strategy = getStrategy(this.#messenger, transactionMeta);

    const start = Date.now();
    const result = await strategy.execute({
      isSmartTransaction: this.#isSmartTransaction,
      quotes,
      messenger: this.#messenger,
      transaction: transactionMeta,
    });

    const executionLatencyMs = Date.now() - start;

    try {
      updateTransaction(
        {
          transactionId,
          messenger: this.#messenger,
          note: 'Update MetaMask Pay execution metrics',
        },
        (tx) => {
          tx.metamaskPay = {
            ...tx.metamaskPay,
            executionLatencyMs,
          };
        },
      );
    } catch (error) {
      log('Failed to update execution metrics', error);
    }

    return result;
  }
}
