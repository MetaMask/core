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

    const transactionData = controllerState.transactionData?.[transactionId];

    const quotes =
      (transactionData?.quotes as TransactionPayQuote<unknown>[]) ?? [];

    if (!quotes?.length) {
      log('Skipping as no quotes found');
      return EMPTY_RESULT;
    }

    const primaryStrategyName = quotes[0].strategy;
    const primaryStrategy = getStrategyByName(primaryStrategyName);
    let hasRecordedLatency = false;

    const recordExecutionLatency = (latencyMs: number): void => {
      if (hasRecordedLatency) {
        return;
      }

      hasRecordedLatency = true;
      this.#recordExecutionMetrics(transactionId, latencyMs);
    };

    try {
      const result = await primaryStrategy.execute({
        isSmartTransaction: this.#isSmartTransaction,
        quotes,
        messenger: this.#messenger,
        onSubmitted: recordExecutionLatency,
        transaction: transactionMeta,
      });

      return result;
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
        onSubmitted: recordExecutionLatency,
      });

      return result;
    }
  }

  #recordExecutionMetrics(
    transactionId: string,
    executionLatencyMs: number,
  ): void {
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
  }

  async #executeFallback({
    transactionMeta,
    transactionData,
    primaryStrategy,
    originalError,
    onSubmitted,
  }: {
    transactionMeta: TransactionMeta;
    transactionData: TransactionData | undefined;
    primaryStrategy: ReturnType<typeof getStrategyByName>;
    originalError: unknown;
    onSubmitted: (latencyMs: number) => void;
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
      onSubmitted,
      requests,
      transaction: transactionMeta,
    };

    for (const strategy of strategies) {
      if (strategy.constructor === primaryStrategy.constructor) {
        continue;
      }

      if (strategy.supports && !strategy.supports(request)) {
        continue;
      }

      try {
        const quotes = await strategy.getQuotes(request);

        if (!quotes?.length) {
          continue;
        }

        return await strategy.execute({
          isSmartTransaction: this.#isSmartTransaction,
          quotes,
          messenger: this.#messenger,
          onSubmitted,
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
