import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import { Messenger } from '@metamask/messenger';

import {
  AlwaysOnlineAdapter,
  connectivityController,
} from './connectivity-controller';

describe('AlwaysOnlineAdapter', () => {
  it('returns Online from getStatus', async () => {
    const adapter = new AlwaysOnlineAdapter();
    const status = await adapter.getStatus();

    expect(status).toBe(CONNECTIVITY_STATUSES.Online);
  });

  it('onConnectivityChange is a no-op', () => {
    const adapter = new AlwaysOnlineAdapter();
    const callback = jest.fn();

    adapter.onConnectivityChange(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it('destroy is a no-op', () => {
    const adapter = new AlwaysOnlineAdapter();

    expect(() => adapter.destroy()).not.toThrow();
  });
});

describe('connectivityController', () => {
  it('reports online status after initialization', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent = new Messenger<'Root', any, any>({ namespace: 'Root' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger = connectivityController.getMessenger(parent as any);
    const controller = connectivityController.init({
      messenger,
      state: undefined,
      options: {},
    });

    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(controller.state.connectivityStatus).toBe(
      CONNECTIVITY_STATUSES.Online,
    );
  });
});
