import {
  TokenListService,
  TokensController,
} from '@metamask/assets-controllers';
import type { TokensControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const tokensController: InitializationConfiguration<
  TokensController,
  TokensControllerMessenger
> = {
  name: 'TokensController',
  reference: TokensController,
  init: ({ state, messenger, options }) => {
    const { tokenListService = new TokenListService(), ...rest } = options;

    return new TokensController({
      ...rest,
      messenger,
      state,
      tokenListService,
    });
  },
  getMessenger: (parent) => {
    const messenger: TokensControllerMessenger = new Messenger({
      namespace: 'TokensController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getAccount',
        'AccountsController:getSelectedAccount',
        'AccountsController:listAccounts',
        'ApprovalController:addRequest',
        'NetworkController:getNetworkClientById',
        'NetworkController:getSelectedNetworkClient',
      ],
      events: [
        'AccountsController:selectedEvmAccountChange',
        'KeyringController:accountRemoved',
        'NetworkController:networkDidChange',
        'NetworkController:stateChange',
      ],
    });

    return messenger;
  },
};
