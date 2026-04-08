import type { KeyringControllerSignTransactionAction } from '@metamask/keyring-controller';
import {
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type {
  NetworkControllerGetEIP1559CompatibilityAction,
  NetworkControllerGetNetworkClientRegistryAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { TransactionControllerOptions } from '@metamask/transaction-controller';
import {
  TransactionController,
  TransactionControllerMessenger,
} from '@metamask/transaction-controller';

import { InitializationConfiguration } from '../types';

type InitActions =
  | NetworkControllerGetNetworkClientRegistryAction
  | NetworkControllerGetEIP1559CompatibilityAction
  | NetworkControllerGetStateAction
  | KeyringControllerSignTransactionAction;

type AllowedActions =
  | MessengerActions<TransactionControllerMessenger>
  | InitActions;

type AllowedEvents = MessengerEvents<TransactionControllerMessenger>;

type WalletTransactionControllerMessenger = Messenger<
  'TransactionController',
  AllowedActions,
  AllowedEvents
>;

export const transactionController: InitializationConfiguration<
  TransactionController,
  WalletTransactionControllerMessenger
> = {
  name: 'TransactionController',
  init: ({ state, messenger }) => {
    // TODO: Add the rest of the arguments.
    const instance = new TransactionController({
      state,
      messenger: messenger as unknown as TransactionControllerMessenger,
      disableHistory: true,
      disableSendFlowHistory: true,
      disableSwaps: true,
      hooks: {},
      getNetworkClientRegistry: () =>
        messenger.call('NetworkController:getNetworkClientRegistry'),
      getCurrentNetworkEIP1559Compatibility: () =>
        messenger.call(
          'NetworkController:getEIP1559Compatibility',
        ) as Promise<boolean>,
      getNetworkState: () => messenger.call('NetworkController:getState'),
      sign: (
        ...args: Parameters<NonNullable<TransactionControllerOptions['sign']>>
      ) =>
        messenger.call(
          'KeyringController:signTransaction',
          ...args,
        ) as unknown as ReturnType<
          NonNullable<TransactionControllerOptions['sign']>
        >,
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
        'NetworkController:getState',
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
