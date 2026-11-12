import { DeFiPositionsController } from '@metamask/assets-controllers';
import type { DeFiPositionsControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const deFiPositionsController: InitializationConfiguration<
  DeFiPositionsController,
  DeFiPositionsControllerMessenger
> = {
  name: 'DeFiPositionsController',
  reference: DeFiPositionsController,
  // The controller always starts from its default state; it takes no `state`.
  init: ({ messenger, options }) =>
    new DeFiPositionsController({
      ...options,
      messenger,
    }),
  getMessenger: (parent) => {
    const messenger: DeFiPositionsControllerMessenger = new Messenger({
      namespace: 'DeFiPositionsController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: ['AccountTreeController:getAccountsFromSelectedAccountGroup'],
      events: [
        'AccountTreeController:selectedAccountGroupChange',
        'KeyringController:lock',
        'TransactionController:transactionConfirmed',
      ],
    });

    return messenger;
  },
};
