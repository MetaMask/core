import type {
  AccountsControllerAccountsAddedEvent,
  AccountsControllerState,
} from '@metamask/accounts-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapId } from '@metamask/snaps-sdk';

import { SnapAccountCache } from './SnapAccountCache.js';
import type { SnapAccountServiceMessenger } from './SnapAccountService.js';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SnapAccountServiceMessenger>,
  MessengerEvents<SnapAccountServiceMessenger>
>;

/**
 * Constructs the root messenger for the cache under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the cache under test, and delegates all
 * required external actions and events from the root messenger to it.
 *
 * @param rootMessenger - The root messenger.
 * @returns The cache messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): SnapAccountServiceMessenger {
  return rootMessenger.buildChild({
    namespace: 'SnapAccountService',
    actions: ['AccountsController:getState'],
    events: [
      'AccountsController:accountsAdded',
      'AccountsController:accountsRemoved',
    ],
  });
}

/**
 * Builds a minimal `AccountsControllerState` whose `internalAccounts.accounts`
 * maps each given account ID to an account owned by the given Snap ID.
 *
 * @param accounts - The accounts to include.
 * @returns A minimal `AccountsControllerState`.
 */
function buildAccountsState(
  accounts: { id: string; snapId?: string }[],
): AccountsControllerState {
  const accountsRecord = Object.fromEntries(
    accounts.map(({ id, snapId }) => [
      id,
      { id, metadata: snapId ? { snap: { id: snapId } } : {} },
    ]),
  );
  return {
    internalAccounts: { accounts: accountsRecord },
  } as unknown as AccountsControllerState;
}

/**
 * Publishes an `AccountsController:accountsAdded` event.
 *
 * @param rootMessenger - The root messenger.
 * @param accounts - The accounts that were added.
 */
function publishAccountsAdded(
  rootMessenger: RootMessenger,
  accounts: { id: string; snapId?: string }[],
): void {
  rootMessenger.publish(
    'AccountsController:accountsAdded',
    accounts.map(({ id, snapId }) => ({
      id,
      metadata: snapId ? { snap: { id: snapId } } : {},
    })) as AccountsControllerAccountsAddedEvent['payload'][0],
  );
}

/**
 * Publishes an `AccountsController:accountsRemoved` event.
 *
 * @param rootMessenger - The root messenger.
 * @param accountIds - The IDs of the accounts that were removed.
 */
function publishAccountsRemoved(
  rootMessenger: RootMessenger,
  accountIds: string[],
): void {
  rootMessenger.publish('AccountsController:accountsRemoved', accountIds);
}

type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  AccountsController: {
    getState: jest.MockedFunction<() => AccountsControllerState>;
  };
};

/**
 * Constructs the cache under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.accounts - Accounts to seed into the `AccountsController:getState` mock.
 * @returns The new cache, root messenger, cache messenger, and mocks.
 */
function setup({
  accounts = [],
}: {
  accounts?: { id: string; snapId?: string }[];
} = {}): {
  cache: SnapAccountCache;
  rootMessenger: RootMessenger;
  mocks: Mocks;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);

  const mocks: Mocks = {
    AccountsController: {
      getState: jest.fn().mockReturnValue(buildAccountsState(accounts)),
    },
  };

  rootMessenger.registerActionHandler(
    'AccountsController:getState',
    mocks.AccountsController.getState,
  );

  const cache = new SnapAccountCache(messenger);

  return { cache, rootMessenger, mocks };
}

const MOCK_SNAP_ID = 'npm:@metamask/mock-snap' as SnapId;
const MOCK_OTHER_SNAP_ID = 'npm:@metamask/other-snap' as SnapId;
const MOCK_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_OTHER_ACCOUNT_ID = '00000000-0000-0000-0000-000000000002';
const MOCK_NO_SNAP_ACCOUNT_ID = '00000000-0000-0000-0000-000000000003';

describe('SnapAccountCache', () => {
  describe('getSnapId', () => {
    it('returns undefined for an unknown account before the cache is built', () => {
      const { cache } = setup();

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBeUndefined();
    });

    it('lazily builds the cache from AccountsController state on first use', () => {
      const { cache, mocks } = setup({
        accounts: [{ id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID }],
      });

      expect(mocks.AccountsController.getState).not.toHaveBeenCalled();

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_SNAP_ID);

      expect(mocks.AccountsController.getState).toHaveBeenCalledTimes(1);
    });

    it('does not rebuild the cache on subsequent calls', () => {
      const { cache, mocks } = setup({
        accounts: [{ id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID }],
      });

      cache.getSnapId(MOCK_ACCOUNT_ID);
      cache.getSnapId(MOCK_ACCOUNT_ID);

      expect(mocks.AccountsController.getState).toHaveBeenCalledTimes(1);
    });

    it('skips accounts without a snap ID when building the cache', () => {
      const { cache } = setup({
        accounts: [
          { id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID },
          { id: MOCK_NO_SNAP_ACCOUNT_ID },
        ],
      });

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_SNAP_ID);
      expect(cache.getSnapId(MOCK_NO_SNAP_ACCOUNT_ID)).toBeUndefined();
    });
  });

  describe('invalidate', () => {
    it('causes the next getSnapId call to rebuild from fresh state', () => {
      const { cache, mocks } = setup({
        accounts: [{ id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID }],
      });

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_SNAP_ID);
      expect(mocks.AccountsController.getState).toHaveBeenCalledTimes(1);

      mocks.AccountsController.getState.mockReturnValue(
        buildAccountsState([
          { id: MOCK_ACCOUNT_ID, snapId: MOCK_OTHER_SNAP_ID },
        ]),
      );

      cache.invalidate();

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_OTHER_SNAP_ID);
      expect(mocks.AccountsController.getState).toHaveBeenCalledTimes(2);
    });
  });

  describe('on AccountsController:accountsAdded', () => {
    it('adds Snap-owned accounts to an initialized cache', () => {
      const { cache, rootMessenger } = setup();

      cache.getSnapId(MOCK_ACCOUNT_ID); // initialize

      publishAccountsAdded(rootMessenger, [
        { id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID },
      ]);

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_SNAP_ID);
    });

    it('skips accounts without a snap ID', () => {
      const { cache, rootMessenger } = setup();

      cache.getSnapId(MOCK_ACCOUNT_ID); // initialize

      publishAccountsAdded(rootMessenger, [{ id: MOCK_NO_SNAP_ACCOUNT_ID }]);

      expect(cache.getSnapId(MOCK_NO_SNAP_ACCOUNT_ID)).toBeUndefined();
    });

    it('is a no-op when the cache is not initialized', () => {
      const { cache, rootMessenger, mocks } = setup({
        accounts: [{ id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID }],
      });

      publishAccountsAdded(rootMessenger, [
        { id: MOCK_ACCOUNT_ID, snapId: MOCK_OTHER_SNAP_ID },
      ]);

      // The cache is still uninitialized — the next getSnapId call rebuilds
      // from state, which still maps MOCK_ACCOUNT_ID to MOCK_SNAP_ID.
      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_SNAP_ID);
      expect(mocks.AccountsController.getState).toHaveBeenCalledTimes(1);
    });
  });

  describe('on AccountsController:accountsRemoved', () => {
    it('removes accounts from an initialized cache', () => {
      const { cache, rootMessenger } = setup({
        accounts: [{ id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID }],
      });

      cache.getSnapId(MOCK_ACCOUNT_ID); // initialize

      publishAccountsRemoved(rootMessenger, [MOCK_ACCOUNT_ID]);

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBeUndefined();
    });

    it('is a no-op for unknown account IDs', () => {
      const { cache, rootMessenger } = setup({
        accounts: [{ id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID }],
      });

      cache.getSnapId(MOCK_ACCOUNT_ID); // initialize

      publishAccountsRemoved(rootMessenger, [MOCK_OTHER_ACCOUNT_ID]);

      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_SNAP_ID);
    });

    it('is a no-op when the cache is not initialized', () => {
      const { cache, rootMessenger, mocks } = setup({
        accounts: [{ id: MOCK_ACCOUNT_ID, snapId: MOCK_SNAP_ID }],
      });

      publishAccountsRemoved(rootMessenger, [MOCK_ACCOUNT_ID]);

      // The cache is still uninitialized — the next getSnapId call rebuilds
      // from state, which still has MOCK_ACCOUNT_ID mapped to MOCK_SNAP_ID.
      expect(cache.getSnapId(MOCK_ACCOUNT_ID)).toBe(MOCK_SNAP_ID);
      expect(mocks.AccountsController.getState).toHaveBeenCalledTimes(1);
    });
  });
});
