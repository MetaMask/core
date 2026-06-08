import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import { Messenger } from '@metamask/messenger';

import { AlwaysOnlineAdapter } from './always-online-adapter';
import { connectivityController } from './connectivity-controller';

describe('connectivityController', () => {
  it('reports online status after initialization', () => {
    const parent: RootMessenger<DefaultActions, DefaultEvents> = new Messenger({ namespace: 'Root' });
    const messenger = connectivityController.getMessenger(parent as any);
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
