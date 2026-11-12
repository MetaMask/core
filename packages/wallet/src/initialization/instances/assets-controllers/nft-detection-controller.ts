import { NftDetectionController } from '@metamask/assets-controllers';
import type {
  NftControllerAddNftsAction,
  NftControllerGetStateAction,
  NftControllerRemoveNftAction,
  NftDetectionControllerMessenger,
} from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

/**
 * The `NftDetectionController` messenger, which can also reach
 * `NftController` to store detected NFTs.
 */
export type NftDetectionControllerInstanceMessenger = Messenger<
  'NftDetectionController',
  | MessengerActions<NftDetectionControllerMessenger>
  | NftControllerAddNftsAction
  | NftControllerGetStateAction
  | NftControllerRemoveNftAction,
  MessengerEvents<NftDetectionControllerMessenger>
>;

export const nftDetectionController: InitializationConfiguration<
  NftDetectionController,
  NftDetectionControllerInstanceMessenger
> = {
  name: 'NftDetectionController',
  reference: NftDetectionController,
  init: ({ messenger, options }) =>
    new NftDetectionController({
      messenger,
      disabled: options.disabled ?? false,
      addNfts: async (...args) =>
        messenger.call('NftController:addNfts', ...args),
      removeNft: (...args) =>
        messenger.call('NftController:removeNft', ...args),
      getNftState: () => messenger.call('NftController:getState'),
    }),
  getMessenger: (parent) => {
    const messenger: NftDetectionControllerInstanceMessenger = new Messenger({
      namespace: 'NftDetectionController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getSelectedAccount',
        'ApprovalController:addRequest',
        'NetworkController:findNetworkClientIdByChainId',
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
        'NftController:addNfts',
        'NftController:getState',
        'NftController:removeNft',
        'PreferencesController:getState',
      ],
      events: [
        'NetworkController:stateChange',
        'PreferencesController:stateChange',
      ],
    });

    return messenger;
  },
};
