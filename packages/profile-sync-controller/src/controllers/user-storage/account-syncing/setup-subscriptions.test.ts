import { setupAccountSyncingSubscriptions } from './setup-subscriptions';

describe('user-storage/account-syncing/setup-subscriptions - setupAccountSyncingSubscriptions', () => {
  it('should subscribe to accountAdded and accountRenamed events', () => {
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

    setupAccountSyncingSubscriptions(options);

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
