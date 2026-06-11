import type { PublishHook } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { PublishHookResult } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types';
import { accountSupports7702 } from '../utils/7702';
import { getStrategyByName } from '../utils/strategy';
import { updateTransaction } from '../utils/transaction';

const log = createModuleLogger(projectLogger, 'pay-publish-hook');

const EMPTY_RESULT = {
  transactionHash: undefined,
};

const ERROR_NO_PAY_QUOTE = 'No pay quote available';

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
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`MetaMask Pay: ${message}`);
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

    const transactionData = controllerState.transactionData?.[transactionId];

    const quotes =
      (transactionData?.quotes as TransactionPayQuote<unknown>[]) ?? [];

    if (!quotes?.length) {
      if (hasExplicitPayConfig(transactionData)) {
        throw new Error(ERROR_NO_PAY_QUOTE);
      }

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

    return await strategy.execute({
      accountSupports7702: accountSupports7702(this.#messenger, from),
      isSmartTransaction: this.#isSmartTransaction,
      quotes,
      messenger: this.#messenger,
      transaction: transactionMeta,
    });
  }
}

function hasExplicitPayConfig(transactionData?: TransactionData): boolean {
  if (!transactionData) {
    return false;
  }

  return [
    transactionData.accountOverride,
    transactionData.fiatPayment?.selectedPaymentMethodId,
    transactionData.isPostQuote,
    transactionData.paymentOverride,
    transactionData.paymentToken,
  ].some(Boolean);
}
