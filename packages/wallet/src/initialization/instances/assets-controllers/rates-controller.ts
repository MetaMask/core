import { RatesController } from '@metamask/assets-controllers';
import type { RatesControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const ratesController: InitializationConfiguration<
  RatesController,
  RatesControllerMessenger
> = {
  name: 'RatesController',
  reference: RatesController,
  init: ({ state, messenger, options }) => {
    const { includeUsdRate = false, ...rest } = options;

    return new RatesController({
      ...rest,
      includeUsdRate,
      messenger,
      state,
    });
  },
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'RatesController',
      parent,
    }),
};
