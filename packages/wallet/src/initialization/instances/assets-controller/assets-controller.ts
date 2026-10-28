import { AssetsController } from '@metamask/assets-controller';
import type { AssetsControllerMessenger } from '@metamask/assets-controller';
import { Messenger } from '@metamask/messenger';
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export type { AssetsControllerInstanceOptions } from './types.js';

/**
 * Initialization configuration for `AssetsController`.
 *
 * This is not part of the default initialization configurations because the
 * Wallet does not yet initialize several of the controllers it depends on
 * (e.g. `AccountTreeController`, `SnapController`). Clients pass it through
 * `initializationConfigurations`. Those configurations are constructed before
 * the default `NetworkEnablementController`. `AssetsController` reads
 * `NetworkEnablementController:getState` from `init()`, which `Wallet.init()`
 * calls after every controller exists, and applies later enablement from
 * `NetworkEnablementController:stateChange`.
 */
export const assetsController: InitializationConfiguration<
  AssetsController,
  AssetsControllerMessenger
> = {
  name: 'AssetsController',
  reference: AssetsController,
  init: ({ state, messenger, options }) => {
    if (!options.queryApiClient) {
      throw new Error(
        'AssetsController requires `instanceOptions.assetsController.queryApiClient`.',
      );
    }

    return new AssetsController({
      ...options,
      messenger,
      state,
    });
  },
  getMessenger: (parent) => {
    // Most of these dependencies are not initialized by the Wallet by default,
    // so the root messenger is widened to the full set the controller uses.
    const rootMessenger = parent as unknown as Messenger<
      'Root',
      MessengerActions<AssetsControllerMessenger>,
      MessengerEvents<AssetsControllerMessenger>
    >;

    const messenger: AssetsControllerMessenger = new Messenger({
      namespace: 'AssetsController',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger,
      actions: [
        'AccountsController:getSelectedAccount',
        'AccountTreeController:getAccountsFromSelectedAccountGroup',
        'AccountTreeController:isInitialized',
        'ClientController:getState',
        'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
        'KeyringController:isUnlocked',
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
        'NetworkEnablementController:getState',
        'PermissionController:getPermissions',
        'PhishingController:bulkScanTokens',
        'RemoteFeatureFlagController:getState',
        'SnapController:getRunnableSnaps',
        'SnapController:handleRequest',
      ],
      events: [
        'AccountActivityService:balanceUpdated',
        'AccountActivityService:statusChanged',
        'AccountsController:accountBalancesUpdated',
        'AccountTreeController:initialized',
        'AccountTreeController:selectedAccountGroupChange',
        'AccountTreeController:uninitialized',
        'ClientController:stateChange',
        'KeyringController:lock',
        'KeyringController:unlock',
        'MultichainTransactionsController:transactionConfirmed',
        'NetworkController:networkAdded',
        'NetworkController:networkDidChange',
        'NetworkController:networkRemoved',
        'NetworkController:stateChange',
        'NetworkEnablementController:stateChange',
        'PermissionController:stateChange',
        'PreferencesController:stateChange',
        'RemoteFeatureFlagController:stateChange',
        'SnapController:snapInstalled',
        'TransactionController:transactionConfirmed',
        'TransactionController:unapprovedTransactionAdded',
      ],
    });

    return messenger;
  },
};
