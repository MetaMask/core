import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';

import { AlwaysOnlineAdapter } from './always-online-adapter.js';

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
