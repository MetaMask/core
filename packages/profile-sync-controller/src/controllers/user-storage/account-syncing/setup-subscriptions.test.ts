import { setupAccountSyncingSubscriptions } from './setup-subscriptions';

describe('setupAccountSyncing', () => {
  it('should subscribe to accountAdded and accountRenamed events', () => {
    const config = { isAccountSyncingEnabled: true };
    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: jest.fn(),
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        state: {
          hasAccountSyncingSyncedAtLeastOnce: true,
        },
      }),
    };

    setupAccountSyncingSubscriptions(config, options);

    expect(options.getMessenger().subscribe).toHaveBeenCalledWith(
      'AccountsController:accountAdded',
      expect.any(Function),
    );

    expect(options.getMessenger().subscribe).toHaveBeenCalledWith(
      'AccountsController:accountRenamed',
      expect.any(Function),
    );
  });
});
