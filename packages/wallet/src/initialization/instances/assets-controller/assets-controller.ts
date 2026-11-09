import { AssetsController } from '@metamask/assets-controller';
import type { AssetsControllerMessenger } from '@metamask/assets-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';
import type { AssetsControllerInstanceOptions } from './types.js';

/** How often prices are polled, in milliseconds. */
const PRICE_POLL_INTERVAL = 180_000;

/** How often staked balances are polled, in milliseconds. */
const STAKED_BALANCE_POLL_INTERVAL = 30_000;

/**
 * Merge the client's options over the wallet's defaults for the poll
 * intervals the extension and mobile clients share.
 *
 * @param options - The client's options for `AssetsController`.
 * @returns The options to construct the controller with, minus `messenger`
 * and `state`.
 */
export function getAssetsControllerOptions(
  options: AssetsControllerInstanceOptions,
): AssetsControllerInstanceOptions {
  return {
    ...options,
    priceDataSourceConfig: {
      pollInterval: PRICE_POLL_INTERVAL,
      ...options.priceDataSourceConfig,
    },
    stakedBalanceDataSourceConfig: {
      pollInterval: STAKED_BALANCE_POLL_INTERVAL,
      ...options.stakedBalanceDataSourceConfig,
    },
  };
}

/**
 * Initialization configuration for `AssetsController`.
 *
 * The controller's constructor only subscribes to events and registers
 * actions; it never calls other controllers. So the wallet can construct it
 * before the controllers it reads from, including ones that are not wallet
 * defaults yet (such as `AccountTreeController` and `SnapController`).
 *
 * The first time the client opens the UI (`ClientController:setUiOpen(true)`),
 * the controller bootstraps: it reads enabled networks, sets up its data
 * sources and, once the keyring is unlocked and the account tree is
 * initialized, starts fetching assets. A controller it reads from that is not
 * registered is treated as not ready, so clients should register the
 * controllers they rely on (through `initializationConfigurations` when they
 * are not defaults) before opening the UI.
 */
export const assetsController: InitializationConfiguration<
  AssetsController,
  AssetsControllerMessenger
> = {
  name: 'AssetsController',
  reference: AssetsController,
  init: ({ state, messenger, options }) =>
    new AssetsController({
      ...getAssetsControllerOptions(options),
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: AssetsControllerMessenger = new Messenger({
      namespace: 'AssetsController',
      parent,
    });

    parent.delegate({
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
