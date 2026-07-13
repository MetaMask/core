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
import { prefixError } from '../utils/error-prefix';
import { isNoOpQuote } from '../utils/no-op-quote';
import { getStrategyByName } from '../utils/strategy';
import { updateTransaction } from '../utils/transaction';

const log = createModuleLogger(projectLogger, 'pay-publish-hook');
const ERROR_PREFIX = 'MetaMask Pay: ';

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
      throw prefixError(error, ERROR_PREFIX);
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
    const allQuotes =
      (transactionData?.quotes as TransactionPayQuote<unknown>[]) ?? [];
    const isFiatSelected = Boolean(
      transactionData?.fiatPayment?.selectedPaymentMethodId,
    );

    const quotes = allQuotes.filter((quote) => !isNoOpQuote(quote));
    const hasNoOpQuote = allQuotes.length > quotes.length;

    if (!quotes.length) {
      if (isFiatSelected) {
        throw new Error('Fiat: Missing quote');
      }

      this.#validateDirectSubmit(transactionData, hasNoOpQuote);

      log('Skipping as no executable quotes found', {
        transactionId,
        hasNoOpQuote,
      });

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

  /**
   * Validate that submitting the transaction without MetaMask Pay is safe.
   *
   * Direct submission is allowed only when MetaMask Pay was never engaged for
   * the transaction, or when the controller explicitly marked the route as
   * direct via a no-op quote and no conversion is currently required.
   *
   * @param transactionData - Pay state for the transaction.
   * @param hasNoOpQuote - Whether a no-op quote is present.
   */
  #validateDirectSubmit(
    transactionData: TransactionData | undefined,
    hasNoOpQuote: boolean,
  ): void {
    const isConversionRequired = Boolean(
      transactionData?.sourceAmounts?.length,
    );

    if (hasNoOpQuote) {
      if (isConversionRequired) {
        throw new Error('Quote skipped but conversion is required');
      }
      return;
    }

    const isPayEngaged =
      Boolean(transactionData?.paymentToken) ||
      transactionData?.isPostQuote === true ||
      transactionData?.isQuoteRequired === true ||
      isConversionRequired;

    if (isPayEngaged) {
      throw new Error('Cannot submit without quote');
    }
  }
}
