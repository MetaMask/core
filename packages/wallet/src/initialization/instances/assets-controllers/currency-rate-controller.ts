import {
  CodefiTokenPricesServiceV2,
  CurrencyRateController,
} from '@metamask/assets-controllers';
import type { CurrencyRateMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const currencyRateController: InitializationConfiguration<
  CurrencyRateController,
  CurrencyRateMessenger
> = {
  name: 'CurrencyRateController',
  reference: CurrencyRateController,
  init: ({ state, messenger, options }) => {
    const { tokenPricesService = new CodefiTokenPricesServiceV2(), ...rest } =
      options;

    return new CurrencyRateController({
      ...rest,
      messenger,
      state,
      tokenPricesService,
    });
  },
  getMessenger: (parent) => {
    const messenger: CurrencyRateMessenger = new Messenger({
      namespace: 'CurrencyRateController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
      ],
    });

    return messenger;
  },
};
