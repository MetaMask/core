import {
  CodefiTokenPricesServiceV2,
  TokenRatesController,
} from '@metamask/assets-controllers';
import type { TokenRatesControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const tokenRatesController: InitializationConfiguration<
  TokenRatesController,
  TokenRatesControllerMessenger
> = {
  name: 'TokenRatesController',
  reference: TokenRatesController,
  init: ({ state, messenger, options }) => {
    const { tokenPricesService = new CodefiTokenPricesServiceV2(), ...rest } =
      options;

    return new TokenRatesController({
      ...rest,
      messenger,
      state,
      tokenPricesService,
    });
  },
  getMessenger: (parent) => {
    const messenger: TokenRatesControllerMessenger = new Messenger({
      namespace: 'TokenRatesController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'NetworkController:getState',
        'NetworkEnablementController:getState',
        'TokensController:getState',
      ],
      events: [
        'NetworkController:stateChange',
        'NetworkEnablementController:stateChange',
        'TokensController:stateChange',
      ],
    });

    return messenger;
  },
};
