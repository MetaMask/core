import { Messenger } from '@metamask/messenger';
import { NetworkClientType } from '@metamask/network-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { networkController } from './network-controller.js';

describe('networkController', () => {
  it('forwards block tracker options through wallet initialization', async () => {
    const parent: RootMessenger<DefaultActions, DefaultEvents> = new Messenger({
      namespace: 'Root',
    });
    const remoteFeatureFlagMessenger = new Messenger<
      'RemoteFeatureFlagController',
      RemoteFeatureFlagControllerGetStateAction,
      never,
      typeof parent
    >({
      namespace: 'RemoteFeatureFlagController',
      parent,
    });
    remoteFeatureFlagMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      () => ({
        remoteFeatureFlags: {},
        cacheTimestamp: 0,
      }),
    );
    const getBlockTrackerOptions = jest.fn(() => ({ pollingInterval: 1000 }));
    const controller = networkController.init({
      state: undefined,
      messenger: networkController.getMessenger(parent),
      options: { infuraProjectId: 'test-project-id', getBlockTrackerOptions },
    });

    try {
      controller.getNetworkClientById('mainnet').blockTracker.getCurrentBlock();

      expect(getBlockTrackerOptions).toHaveBeenCalledWith(
        'https://mainnet.infura.io/v3/test-project-id',
        expect.objectContaining({
          type: NetworkClientType.Infura,
          chainId: '0x1',
        }),
      );
    } finally {
      await controller.destroy();
    }
  });
});
