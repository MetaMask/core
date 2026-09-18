import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { AlwaysOnlineAdapter } from './always-online-adapter.js';
import { connectivityController } from './connectivity-controller.js';

describe('connectivityController', () => {
  it('reports online status after initialization', () => {
    const parent: RootMessenger<DefaultActions, DefaultEvents> = new Messenger({
      namespace: 'Root',
    });
    const messenger = connectivityController.getMessenger(parent);
    const controller = connectivityController.init({
      messenger,
      state: undefined,
      options: { connectivityAdapter: new AlwaysOnlineAdapter() },
    });

    expect(controller.state.connectivityStatus).toBe(
      CONNECTIVITY_STATUSES.Online,
    );
  });
});
