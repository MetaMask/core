import { AssetsContractController } from '@metamask/assets-controllers';
import type { AssetsContractControllerMessenger } from '@metamask/assets-controllers';
import { ChainId } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const assetsContractController: InitializationConfiguration<
  AssetsContractController,
  AssetsContractControllerMessenger
> = {
  name: 'AssetsContractController',
  init: ({ messenger, options }) =>
    new AssetsContractController({
      messenger,
      chainId: options.chainId ?? ChainId.mainnet,
    }),
  getMessenger: (parent) => {
    const messenger: AssetsContractControllerMessenger = new Messenger({
      namespace: 'AssetsContractController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'NetworkController:getNetworkClientById',
        'NetworkController:getNetworkConfigurationByNetworkClientId',
        'NetworkController:getSelectedNetworkClient',
        'NetworkController:getState',
      ],
      events: [
        'NetworkController:networkDidChange',
        'PreferencesController:stateChange',
      ],
    });

    return messenger;
  },
};
