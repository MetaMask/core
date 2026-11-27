import {
  CodefiTokenPricesServiceV2,
  TokenSearchDiscoveryDataController,
} from '@metamask/assets-controllers';
import type { TokenSearchDiscoveryDataControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const tokenSearchDiscoveryDataController: InitializationConfiguration<
  TokenSearchDiscoveryDataController,
  TokenSearchDiscoveryDataControllerMessenger
> = {
  name: 'TokenSearchDiscoveryDataController',
  reference: TokenSearchDiscoveryDataController,
  init: ({ state, messenger, options }) =>
    new TokenSearchDiscoveryDataController({
      messenger,
      state,
      tokenPricesService:
        options.tokenPricesService ?? new CodefiTokenPricesServiceV2(),
    }),
  getMessenger: (parent) => {
    const messenger: TokenSearchDiscoveryDataControllerMessenger =
      new Messenger({
        namespace: 'TokenSearchDiscoveryDataController',
        parent,
      });

    parent.delegate({
      messenger,
      actions: ['CurrencyRateController:getState'],
    });

    return messenger;
  },
};
