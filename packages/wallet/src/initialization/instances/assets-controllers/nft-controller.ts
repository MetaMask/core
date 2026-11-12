import { NftController } from '@metamask/assets-controllers';
import type { NftControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const nftController: InitializationConfiguration<
  NftController,
  NftControllerMessenger
> = {
  name: 'NftController',
  reference: NftController,
  init: ({ state, messenger, options }) =>
    new NftController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: NftControllerMessenger = new Messenger({
      namespace: 'NftController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getAccount',
        'AccountsController:getSelectedAccount',
        'ApprovalController:addRequest',
        'AssetsContractController:getERC1155TokenURI',
        'AssetsContractController:getERC721AssetName',
        'AssetsContractController:getERC721AssetSymbol',
        'AssetsContractController:getERC721TokenURI',
        'NetworkController:findNetworkClientIdByChainId',
        'NetworkController:getNetworkClientById',
        'PhishingController:bulkScanUrls',
      ],
      events: [
        'AccountsController:selectedEvmAccountChange',
        'PreferencesController:stateChange',
      ],
    });

    return messenger;
  },
};
