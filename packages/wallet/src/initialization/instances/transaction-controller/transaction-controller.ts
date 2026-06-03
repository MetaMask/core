import { Messenger } from '@metamask/messenger';
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';
import type { TransactionControllerMessenger } from '@metamask/transaction-controller';
import { TransactionController } from '@metamask/transaction-controller';

import type { InitializationConfiguration } from '../../types';
import {
  TRANSACTION_CONTROLLER_EXTERNAL_ACTIONS,
  TRANSACTION_CONTROLLER_EXTERNAL_EVENTS,
} from './constants';

export type { TransactionControllerInstanceOptions } from './types';

export const transactionController: InitializationConfiguration<
  TransactionController,
  TransactionControllerMessenger
> = {
  name: 'TransactionController',
  init: ({ state, messenger, options }) =>
    new TransactionController({
      ...options,
      incomingTransactions: { isEnabled: () => false },
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger = new Messenger<
      'TransactionController',
      MessengerActions<TransactionControllerMessenger>,
      MessengerEvents<TransactionControllerMessenger>,
      typeof parent
    >({
      namespace: 'TransactionController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [...TRANSACTION_CONTROLLER_EXTERNAL_ACTIONS],
      events: [...TRANSACTION_CONTROLLER_EXTERNAL_EVENTS],
    });

    return messenger;
  },
};
