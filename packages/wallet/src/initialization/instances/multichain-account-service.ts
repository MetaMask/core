import {
  MultichainAccountService,
  SOL_ACCOUNT_PROVIDER_NAME,
  TRX_ACCOUNT_PROVIDER_NAME,
  BTC_ACCOUNT_PROVIDER_NAME,
  MultichainAccountServiceMessenger,
} from '@metamask/multichain-account-service';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../types';


export const multichainAccountService: InitializationConfiguration<
  MultichainAccountService,
  MultichainAccountServiceMessenger
> = {
  name: 'MultichainAccountService',
  init: ({ messenger }) => {
    const instance = new MultichainAccountService({
      messenger,
    });

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
