import {
  TokenDetectionController,
  TokenListService,
} from '@metamask/assets-controllers';
import type {
  AssetsContractControllerGetBalancesInSingleCallAction,
  TokenDetectionControllerMessenger,
} from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

/**
 * The `TokenDetectionController` messenger, which can also reach
 * `AssetsContractController` for balances.
 */
export type TokenDetectionControllerInstanceMessenger = Messenger<
  'TokenDetectionController',
  | MessengerActions<TokenDetectionControllerMessenger>
  | AssetsContractControllerGetBalancesInSingleCallAction,
  MessengerEvents<TokenDetectionControllerMessenger>
>;

export const tokenDetectionController: InitializationConfiguration<
  TokenDetectionController,
  TokenDetectionControllerInstanceMessenger
> = {
  name: 'TokenDetectionController',
  reference: TokenDetectionController,
  init: ({ messenger, options }) => {
    const {
      tokenListService = new TokenListService(),
      trackMetaMetricsEvent = (): void => undefined,
      ...rest
    } = options;

    return new TokenDetectionController({
      ...rest,
      messenger,
      tokenListService,
      trackMetaMetricsEvent,
      getBalancesInSingleCall: async (...args) =>
        messenger.call(
          'AssetsContractController:getBalancesInSingleCall',
          ...args,
        ),
    });
  },
  getMessenger: (parent) => {
    const messenger: TokenDetectionControllerInstanceMessenger = new Messenger({
      namespace: 'TokenDetectionController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getAccount',
        'AccountsController:getSelectedAccount',
        'AssetsContractController:getBalancesInSingleCall',
        'AuthenticationController:getBearerToken',
        'KeyringController:getState',
        'NetworkController:findNetworkClientIdByChainId',
        'NetworkController:getNetworkClientById',
        'NetworkController:getNetworkConfigurationByNetworkClientId',
        'NetworkController:getState',
        'PreferencesController:getState',
        'TokensController:addDetectedTokens',
        'TokensController:addTokens',
        'TokensController:getState',
      ],
      events: [
        'AccountsController:selectedEvmAccountChange',
        'KeyringController:lock',
        'KeyringController:unlock',
        'NetworkController:networkDidChange',
        'PreferencesController:stateChange',
        'TransactionController:transactionConfirmed',
      ],
    });

    return messenger;
  },
};
