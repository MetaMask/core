import {
  MultichainAccountService,
  SOL_ACCOUNT_PROVIDER_NAME,
  TRX_ACCOUNT_PROVIDER_NAME,
  BTC_ACCOUNT_PROVIDER_NAME,
  MultichainAccountServiceMessenger,
} from '@metamask/multichain-account-service';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../types';

const snapAccountProviderConfig = {
  // READ THIS CAREFULLY:
  // We are using 1 to prevent any concurrent `keyring_createAccount` requests. This ensures
  // we prevent any desync between Snap's accounts and Metamask's accounts.
  maxConcurrency: 1,
  // Re-use the default config for the rest:
  discovery: {
    timeoutMs: 2000,
    maxAttempts: 3,
    backOffMs: 1000,
  },
  createAccounts: {
    timeoutMs: 3000,
    batched: false,
  },
  resyncAccounts: {
    autoRemoveExtraSnapAccounts: false,
  },
};

export const multichainAccountService: InitializationConfiguration<
  MultichainAccountService,
  MultichainAccountServiceMessenger
> = {
  name: 'MultichainAccountService',
  init: ({ messenger, options }) => {
    const instance = new MultichainAccountService({
      messenger,
      providerConfigs: {
        [SOL_ACCOUNT_PROVIDER_NAME]: {
          ...snapAccountProviderConfig,
          createAccounts: {
            ...snapAccountProviderConfig.createAccounts,
            batched: true,
          },
        },
        [BTC_ACCOUNT_PROVIDER_NAME]: snapAccountProviderConfig,
        [TRX_ACCOUNT_PROVIDER_NAME]: snapAccountProviderConfig,
      },
      ensureOnboardingComplete: options.ensureOnboardingComplete,
    });

    // TODO: Basic Functionality triggers

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const serviceMessenger: MultichainAccountServiceMessenger = new Messenger({
      namespace: 'MultichainAccountService',
      parent,
    });

    parent.delegate({
      messenger: serviceMessenger,
      events: [
        'KeyringController:stateChange',
        'SnapController:stateChange',
        'AccountsController:accountAdded',
        'AccountsController:accountRemoved',
      ],
      actions: [
        'AccountsController:listMultichainAccounts',
        'AccountsController:getAccountByAddress',
        'AccountsController:getAccount',
        'AccountsController:getAccounts',
        'SnapController:getState',
        'SnapController:handleRequest',
        'KeyringController:getState',
        'KeyringController:withKeyring',
        'KeyringController:addNewKeyring',
        'KeyringController:getKeyringsByType',
        'KeyringController:createNewVaultAndKeychain',
        'KeyringController:createNewVaultAndRestore',
        'NetworkController:getNetworkClientById',
        'NetworkController:findNetworkClientIdByChainId',
      ],
    });

    return serviceMessenger;
  }
};
