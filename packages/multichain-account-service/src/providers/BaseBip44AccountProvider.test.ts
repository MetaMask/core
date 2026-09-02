import type {
  CreateAccountOptions,
  KeyringAccount,
  KeyringCapabilities,
} from '@metamask/keyring-api';
import type { Bip44Account } from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
} from '../tests/index.js';
import type { RootMessenger } from '../tests/index.js';
import { BaseBip44AccountProvider } from './BaseBip44AccountProvider.js';

/**
 * Minimal concrete subclass so we can exercise the abstract base class
 * directly, matching the pattern used to test other abstract collaborators
 * in this package.
 */
class TestAccountProvider extends BaseBip44AccountProvider<
  Bip44Account<KeyringAccount>
> {
  get capabilities(): KeyringCapabilities {
    return { supportsEnabling: true } as unknown as KeyringCapabilities;
  }

  getName(): string {
    return 'TestAccountProvider';
  }

  async resyncAccounts(): Promise<void> {
    // No-op for this test double.
  }

  isAccountCompatible(): boolean {
    return true;
  }

  async createAccounts(
    _options: CreateAccountOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    return [];
  }

  async deleteAccount(): Promise<void> {
    // No-op for this test double.
  }

  async discoverAccounts(): Promise<Bip44Account<KeyringAccount>[]> {
    return [];
  }
}

/**
 * Sets up a provider wired to a messenger whose
 * `AccountsController:getAccounts` handler mirrors the real
 * `AccountsController.getAccounts` contract: one slot per requested ID,
 * `undefined` in place for any ID the controller no longer knows about
 * (rather than omitting it, which would silently shrink the array).
 *
 * @param knownAccounts - The accounts the mocked AccountsController knows
 * about.
 * @returns The provider under test and its messenger.
 */
function setup(knownAccounts: InternalAccount[] = []): {
  provider: TestAccountProvider;
  messenger: RootMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMultichainAccountServiceMessenger(rootMessenger);

  rootMessenger.registerActionHandler(
    'AccountsController:getAccounts',
    (accountIds: string[]) =>
      accountIds.map((id) =>
        knownAccounts.find((account) => account.id === id),
      ),
  );

  return {
    provider: new TestAccountProvider(messenger),
    messenger: rootMessenger,
  };
}

describe('BaseBip44AccountProvider', () => {
  describe('getAccounts', () => {
    it('filters out accounts the AccountsController no longer knows about', () => {
      // Only account 1 is "known" -- account 2 has been removed from the
      // AccountsController's perspective, but is still tracked by this
      // provider (e.g. before a reconciling init() call happens).
      const { provider } = setup([MOCK_HD_ACCOUNT_1]);
      provider.init([MOCK_HD_ACCOUNT_1.id, MOCK_HD_ACCOUNT_2.id]);

      const accounts = provider.getAccounts();

      expect(accounts).toStrictEqual([MOCK_HD_ACCOUNT_1]);
      expect(accounts).not.toContain(undefined);
    });

    it('returns an empty array when none of the tracked accounts exist anymore', () => {
      const { provider } = setup([]);
      provider.init([MOCK_HD_ACCOUNT_1.id, MOCK_HD_ACCOUNT_2.id]);

      expect(provider.getAccounts()).toStrictEqual([]);
    });

    it('returns all accounts unchanged when every tracked account still exists', () => {
      const { provider } = setup([MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2]);
      provider.init([MOCK_HD_ACCOUNT_1.id, MOCK_HD_ACCOUNT_2.id]);

      expect(provider.getAccounts()).toStrictEqual([
        MOCK_HD_ACCOUNT_1,
        MOCK_HD_ACCOUNT_2,
      ]);
    });
  });

  describe('init', () => {
    it('does not leave stale account IDs behind after a re-init with a smaller set', () => {
      const { provider } = setup([MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2]);

      // First init: both accounts are tracked.
      provider.init([MOCK_HD_ACCOUNT_1.id, MOCK_HD_ACCOUNT_2.id]);
      expect(
        provider.isAligned({ entropySource: 'x', groupIndex: 0 }, [
          MOCK_HD_ACCOUNT_2.id,
        ]),
      ).toBe(true);

      // Account 2 gets removed upstream; a real caller (e.g. the mobile
      // app's Authentication flow, which calls
      // MultichainAccountService.init() -> provider.init() on every
      // unlock) re-initializes the provider with only the surviving
      // account.
      provider.init([MOCK_HD_ACCOUNT_1.id]);

      // The stale ID for the removed account must not still be tracked.
      expect(
        provider.isAligned({ entropySource: 'x', groupIndex: 0 }, [
          MOCK_HD_ACCOUNT_2.id,
        ]),
      ).toBe(false);
      expect(
        provider.isAligned({ entropySource: 'x', groupIndex: 0 }, [
          MOCK_HD_ACCOUNT_1.id,
        ]),
      ).toBe(true);
    });

    it('is idempotent when called repeatedly with the same accounts', () => {
      const { provider } = setup([MOCK_HD_ACCOUNT_1]);

      provider.init([MOCK_HD_ACCOUNT_1.id]);
      provider.init([MOCK_HD_ACCOUNT_1.id]);
      provider.init([MOCK_HD_ACCOUNT_1.id]);

      expect(
        provider.isAligned({ entropySource: 'x', groupIndex: 0 }, [
          MOCK_HD_ACCOUNT_1.id,
        ]),
      ).toBe(true);
    });
  });
});
