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

import { bindMessengerAction, InitializationConfiguration } from '../types';

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
    const instance = new TransactionController({
      state,
      messenger: messenger as unknown as TransactionControllerMessenger,
      disableHistory: true,
      disableSendFlowHistory: true,
      disableSwaps: false,
      hooks: {},
      getNetworkClientRegistry: bindMessengerAction(
        messenger,
        'NetworkController:getNetworkClientRegistry',
      ),
      getCurrentNetworkEIP1559Compatibility: bindMessengerAction(
        messenger,
        'NetworkController:getEIP1559Compatibility',
      ) as () => Promise<boolean>,
      getNetworkState: bindMessengerAction(
        messenger,
        'NetworkController:getState',
      ),
      // KeyringController.signTransaction is typed as returning
      // Promise<TypedTxData> (a plain data object), but the actual keyring
      // implementations return the full TypedTransaction class instance.
      // TransactionController expects Promise<TypedTransaction> here. The
      // cast bridges a stale return-type declaration in KeyringController,
      // not a real runtime mismatch.
      sign: bindMessengerAction(
        messenger,
        'KeyringController:signTransaction',
      ) as unknown as TransactionControllerOptions['sign'],
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
        // TransactionController subscribes to :stateChange internally; the
        // delegation must match until that package migrates to :stateChanged.
        // eslint-disable-next-line no-restricted-syntax
        'NetworkController:stateChange',
      ],
    });

    return transactionControllerMessenger;
  },
};
