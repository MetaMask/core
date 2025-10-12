import type { Messenger } from '@metamask/base-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import type { PublishHook } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { PublishHookResult } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import { TestStrategy } from '../strategy/TestStrategy';
import type {
  PayStrategy,
  TransactionPayControllerGetStateAction,
  TransactionPayControllerGetStrategyAction,
} from '../types';

const log = createModuleLogger(projectLogger, 'pay-publish-hook');

const EMPTY_RESULT = {
  transactionHash: undefined,
};

export type TransactionPayPublishHookMessenger = Messenger<
  | BridgeStatusControllerActions
  | TransactionPayControllerGetStateAction
  | TransactionPayControllerGetStrategyAction,
  | BridgeStatusControllerStateChangeEvent
  | TransactionControllerUnapprovedTransactionAddedEvent
>;

export class TransactionPayPublishHook {
  // eslint-disable-next-line no-unused-private-class-members
  readonly #isSmartTransaction: (chainId: Hex) => boolean;

  readonly #messenger: TransactionPayPublishHookMessenger;

  constructor({
    isSmartTransaction,
    messenger,
  }: {
    isSmartTransaction: (chainId: Hex) => boolean;
    messenger: TransactionPayPublishHookMessenger;
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
      (controllerState.transactionData?.[transactionId]?.quotes as never) ?? [];

    const strategy = await this.#getStrategy(transactionMeta);
    await strategy.execute({ quotes });

    return EMPTY_RESULT;
  }

  async #getStrategy(
    transaction: TransactionMeta,
  ): Promise<PayStrategy<unknown>> {
    const _strategyName = await this.#messenger.call(
      'TransactionPayController:getStrategy',
      transaction,
    );

    return new TestStrategy() as PayStrategy<unknown>;
  }
}
