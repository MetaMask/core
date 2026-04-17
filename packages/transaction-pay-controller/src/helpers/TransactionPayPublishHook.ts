import type { PublishHook } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { PublishHookResult } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  AccountSupports7702Callback,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types';
import { getStrategyByName } from '../utils/strategy';
import { updateTransaction } from '../utils/transaction';

const log = createModuleLogger(projectLogger, 'pay-publish-hook');

const EMPTY_RESULT = {
  transactionHash: undefined,
};

export class TransactionPayPublishHook {
  readonly #isSmartTransaction: (chainId: Hex) => boolean;

  readonly #messenger: TransactionPayControllerMessenger;

  readonly #accountSupports7702: AccountSupports7702Callback;

  constructor({
    accountSupports7702,
    isSmartTransaction,
    messenger,
  }: {
    accountSupports7702: AccountSupports7702Callback;
    isSmartTransaction: (chainId: Hex) => boolean;
    messenger: TransactionPayControllerMessenger;
  }) {
    this.#accountSupports7702 = accountSupports7702;
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

    updateTransaction(
      {
        transactionId,
        messenger: this.#messenger,
        note: 'Set submittedTime at pay publish hook start',
      },
      (tx) => {
        tx.submittedTime = new Date().getTime();
      },
    );

    const strategy = getStrategyByName(quotes[0].strategy);
    const from = transactionMeta.txParams.from as Hex;
    const accountSupports7702 = await this.#accountSupports7702(from);

    return await strategy.execute({
      accountSupports7702,
      isSmartTransaction: this.#isSmartTransaction,
      quotes,
      messenger: this.#messenger,
      transaction: transactionMeta,
    });
  }
}
