import {
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import {
  TransactionController,
  TransactionControllerMessenger,
} from '@metamask/transaction-controller';

import { InitializationConfiguration } from '../types';

type AllowedActions = MessengerActions<TransactionControllerMessenger>;

type AllowedEvents = MessengerEvents<TransactionControllerMessenger>;

export const transactionController: InitializationConfiguration<
  TransactionController,
  TransactionControllerMessenger
> = {
  name: 'TransactionController',
  init: ({ state, messenger }) => {
    // TODO: Add the rest of the arguments.
    const instance = new TransactionController({
      state,
      messenger,
      getNetworkClientRegistry: messenger.call.bind(
        messenger,
        'NetworkController:getNetworkClientRegistry',
      ),
      getCurrentNetworkEIP1559Compatibility: messenger.call.bind(
        messenger,
        'NetworkController:getEIP1559Compatibility',
      ),
      sign: messenger.call.bind(messenger, 'KeyringController:signTransaction'),
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const transactionControllerMessenger = new Messenger<
      'TransactionController',
      AllowedActions,
      AllowedEvents,
      typeof parent
    >({
      namespace: 'TransactionController',
      parent,
    });

    parent.delegate({
      messenger: transactionControllerMessenger,
      actions: [
        'AccountsController:getSelectedAccount',
        'AccountsController:getState',
        `ApprovalController:addRequest`,
        'KeyringController:signEip7702Authorization',
        'NetworkController:findNetworkClientIdByChainId',
        'NetworkController:getNetworkClientById',
        'RemoteFeatureFlagController:getState',
        // TODO: These are added for use in the constructor, in the extension this uses the "init messenger" concept.
        'NetworkController:getNetworkClientRegistry',
        'NetworkController:getEIP1559Compatibility',
        'KeyringController:signTransaction',
      ],
      events: [
        'AccountActivityService:transactionUpdated',
        'AccountActivityService:statusChanged',
        'AccountsController:selectedAccountChange',
        'BackendWebSocketService:connectionStateChanged',
        'NetworkController:stateChange',
      ],
    });

    return transactionControllerMessenger;
  },
};
