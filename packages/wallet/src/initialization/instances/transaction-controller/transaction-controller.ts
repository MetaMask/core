import { Messenger } from '@metamask/messenger';
import type { TransactionControllerMessenger } from '@metamask/transaction-controller';
import { TransactionController } from '@metamask/transaction-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { TransactionControllerInstanceOptions } from './types.js';

export const transactionController: InitializationConfiguration<
  TransactionController,
  TransactionControllerMessenger
> = {
  name: 'TransactionController',
  init: ({ state, messenger, options }) => {
    const { disableSwaps = false, ...rest } = options;

    return new TransactionController({
      ...rest,
      disableSwaps,
      messenger,
      state,
    });
  },
  getMessenger: (parent) => {
    const messenger: TransactionControllerMessenger = new Messenger({
      namespace: 'TransactionController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getSelectedAccount',
        'AccountsController:getState',
        'ApprovalController:addRequest',
        'GasFeeController:fetchGasFeeEstimates',
        'KeyringController:getState',
        'KeyringController:signEip7702Authorization',
        'KeyringController:signTransaction',
        'NetworkController:findNetworkClientIdByChainId',
        'NetworkController:getEIP1559Compatibility',
        'NetworkController:getNetworkClientById',
        'NetworkController:getNetworkClientRegistry',
        'NetworkController:getState',
        'RemoteFeatureFlagController:getState',
      ],
      events: [
        'AccountActivityService:transactionUpdated',
        // TODO: Replace with `NetworkController:stateChanged` once TransactionController migrates.
        // eslint-disable-next-line no-restricted-syntax
        'NetworkController:stateChange',
      ],
    });

    return messenger;
  },
};
