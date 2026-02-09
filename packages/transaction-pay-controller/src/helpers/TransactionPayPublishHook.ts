import type { PublishHook } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { PublishHookResult } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionData,
  TransactionPayQuote,
} from '../types';
import { buildQuoteRequests } from '../utils/quotes';
import { getStrategies, getStrategyByName } from '../utils/strategy';

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

    const transactionData = controllerState.transactionData?.[transactionId];

    const quotes =
      (transactionData?.quotes as TransactionPayQuote<unknown>[]) ?? [];

    if (!quotes?.length) {
      log('Skipping as no quotes found');
      return EMPTY_RESULT;
    }

    const primaryStrategyName = quotes[0].strategy;
    const primaryStrategy = getStrategyByName(primaryStrategyName);

    try {
      return await primaryStrategy.execute({
        isSmartTransaction: this.#isSmartTransaction,
        quotes,
        messenger: this.#messenger,
        transaction: transactionMeta,
      });
    } catch (error) {
      log('Primary strategy failed, attempting fallback', {
        error,
        strategy: primaryStrategyName,
      });

      const result = await this.#executeFallback({
        transactionMeta,
        transactionData,
        primaryStrategy,
        originalError: error,
      });

      return result;
    }
  }

  async #executeFallback({
    transactionMeta,
    transactionData,
    primaryStrategy,
    originalError,
  }: {
    transactionMeta: TransactionMeta;
    transactionData: TransactionData | undefined;
    primaryStrategy: ReturnType<typeof getStrategyByName>;
    originalError: unknown;
  }): Promise<PublishHookResult> {
    /* istanbul ignore next */
    if (!transactionData) {
      throw originalError;
    }

    const { isMaxAmount, paymentToken, sourceAmounts, tokens } =
      transactionData;

    const requests = buildQuoteRequests({
      from: transactionMeta.txParams.from as Hex,
      isMaxAmount: isMaxAmount ?? false,
      paymentToken,
      sourceAmounts,
      tokens: tokens ?? [],
      transactionId: transactionMeta.id,
    });

    if (!requests.length) {
      throw originalError;
    }

    const strategies = getStrategies(this.#messenger, transactionMeta);
    const request = {
      messenger: this.#messenger,
      requests,
      transaction: transactionMeta,
    };

    for (const strategy of strategies) {
      if (strategy.constructor === primaryStrategy.constructor) {
        continue;
      }

      try {
        if (strategy.supports && !strategy.supports(request)) {
          continue;
        }

        const fallbackQuotes = await strategy.getQuotes(request);

        if (!fallbackQuotes?.length) {
          continue;
        }

        return await strategy.execute({
          isSmartTransaction: this.#isSmartTransaction,
          quotes: fallbackQuotes,
          messenger: this.#messenger,
          transaction: transactionMeta,
        });
      } catch (error) {
        log('Strategy failed, trying next', { error });
        continue;
      }
    }

    throw originalError;
  }
}
