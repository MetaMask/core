import { setupAccountSyncingSubscriptions } from './setup-subscriptions';

describe('user-storage/account-syncing/setup-subscriptions - setupAccountSyncingSubscriptions', () => {
  it('should subscribe to the accountRenamed event', () => {
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
      'AccountsController:accountRenamed',
      expect.any(Function),
    );
  });
});
