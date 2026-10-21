import type { PublishHook } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { PublishHookResult } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { TransactionPayStrategy } from '../constants.js';
import { projectLogger } from '../logger.js';
import type {
  NonEvmTransactionPayQuote,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import { accountSupports7702 } from '../utils/7702.js';
import { prefixError } from '../utils/error-prefix.js';
import { getStrategyByName } from '../utils/strategy.js';
import { isNonEvmPaymentToken } from '../utils/token.js';
import { updateTransaction } from '../utils/transaction.js';

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
    // No-op quotes mark direct routes and cannot be executed by any strategy.
    const allQuotes = (
      (transactionData?.quotes as (
        | TransactionPayQuote<unknown>
        | NonEvmTransactionPayQuote<unknown>
      )[]) ?? []
    ).filter((quote) => quote.strategy !== TransactionPayStrategy.None);

    // Quotes for a non-EVM payment token are executed by the strategy outside
    // the EVM publish path.
    const isNonEvm = Boolean(
      transactionData?.paymentToken &&
      isNonEvmPaymentToken(transactionData.paymentToken),
    );
    const nonEvmQuotes = isNonEvm
      ? (allQuotes as NonEvmTransactionPayQuote<unknown>[])
      : [];
    const quotes = isNonEvm
      ? []
      : (allQuotes as TransactionPayQuote<unknown>[]);

    const isFiatSelected = Boolean(
      transactionData?.fiatPayment?.selectedPaymentMethodId,
    );

    if (!quotes.length && !nonEvmQuotes.length) {
      if (isFiatSelected) {
        throw new Error('Fiat: Missing quote');
      }

      log('Skipping as no executable quotes found', { transactionId });

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

    const strategy = getStrategyByName(allQuotes[0].strategy);
    const from = transactionMeta.txParams.from as Hex;

    return await strategy.execute({
      accountSupports7702: accountSupports7702(this.#messenger, from),
      isSmartTransaction: this.#isSmartTransaction,
      ...(nonEvmQuotes.length > 0 && { nonEvmQuotes }),
      quotes,
      messenger: this.#messenger,
      transaction: transactionMeta,
    });
  }
}
