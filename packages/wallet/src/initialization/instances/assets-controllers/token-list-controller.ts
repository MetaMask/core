import { TokenListController } from '@metamask/assets-controllers';
import type { TokenListControllerMessenger } from '@metamask/assets-controllers';
import { ChainId } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const tokenListController: InitializationConfiguration<
  TokenListController,
  TokenListControllerMessenger
> = {
  name: 'TokenListController',
  reference: TokenListController,
  init: ({ state, messenger, options }) => {
    const { chainId = ChainId.mainnet, ...rest } = options;

    return new TokenListController({
      ...rest,
      chainId,
      messenger,
      state,
    });
  },
  getMessenger: (parent) => {
    const messenger: TokenListControllerMessenger = new Messenger({
      namespace: 'TokenListController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'NetworkController:getNetworkClientById',
        'StorageService:getAllKeys',
        'StorageService:getItem',
        'StorageService:setItem',
      ],
      events: ['NetworkController:stateChange'],
    });

    return messenger;
  },
};
