import { isBip44Account } from '@metamask/account-api';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';

import { AccountProviderWrapper } from './AccountProviderWrapper';
import { SnapAccountProviderConfig } from './SnapAccountProvider';
import {
  TRX_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
  TRX_ACCOUNT_PROVIDER_NAME,
  TrxAccountProvider,
} from './TrxAccountProvider';
import { TraceName } from '../constants/traces';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_KEYRING_1,
  MOCK_TRX_ACCOUNT_1,
  MOCK_TRX_DISCOVERED_ACCOUNT_1,
  MockAccountBuilder,
} from '../tests';
import type { RootMessenger } from '../tests';

class MockTronKeyring {
  readonly type = 'MockTronKeyring';

  readonly metadata: KeyringMetadata = {
    id: 'mock-tron-keyring-id',
    name: '',
  };

  readonly accounts: InternalAccount[];

  constructor(accounts: InternalAccount[]) {
    this.accounts = accounts;
  }

  createAccount: SnapKeyring['createAccount'] = jest
    .fn()
    .mockImplementation((_, { index }) => {
      // Use the provided index or fallback to accounts length
      const groupIndex = index !== undefined ? index : this.accounts.length;

      // Check if an account already exists for this group index (idempotent behavior)
      const found = this.accounts.find(
        (account) =>
          isBip44Account(account) &&
          account.options.entropy.groupIndex === groupIndex,
      );

      if (found) {
        return found; // Idempotent.
      }

      // Create new account with the correct group index
      const account = MockAccountBuilder.from(MOCK_TRX_ACCOUNT_1)
        .withUuid()
        .withAddressSuffix(`${this.accounts.length}`)
        .withGroupIndex(groupIndex)
        .get();
      this.accounts.push(account);

      return account;
    });

  // Add discoverAccounts method to match the provider's usage
  discoverAccounts = jest.fn().mockResolvedValue([]);
}
class MockTrxAccountProvider extends TrxAccountProvider {
  override async ensureSnapPlatformIsReady(): Promise<void> {
    // Override to avoid waiting during tests.
  }
}

/**
 * Sets up a TrxAccountProvider for testing.
 *
 * @param options - Configuration options for setup.
 * @param options.messenger - An optional messenger instance to use. Defaults to a new Messenger.
 * @param options.accounts - List of accounts to use.
 * @param options.config - Provider config.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts = [],
  config,
}: {
  messenger?: RootMessenger;
  accounts?: InternalAccount[];
  config?: SnapAccountProviderConfig;
} = {}): {
  provider: AccountProviderWrapper;
  messenger: RootMessenger;
  keyring: MockTronKeyring;
  mocks: {
    handleRequest: jest.Mock;
    keyring: {
      createAccount: jest.Mock;
      discoverAccounts: jest.Mock;
    };
  };
} {
  const keyring = new MockTronKeyring(accounts);

  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    () => accounts,
  );

  const mockHandleRequest = jest.fn().mockImplementation((request) => {
    // Handle KeyringClient discoverAccounts calls
    if (request.request?.method === 'keyring_discoverAccounts') {
      // Return the keyring's discoverAccounts result directly
      return keyring.discoverAccounts();
    }
    // Handle other requests (fallback for legacy compatibility)
    return keyring.accounts.find(
      (account) => account.address === request.address,
    );
  });
  messenger.registerActionHandler(
    'SnapController:handleRequest',
    mockHandleRequest,
  );

  messenger.registerActionHandler(
    'KeyringController:withKeyring',
    async (_, operation) =>
      operation({
        // We type-cast here, since `withKeyring` defaults to `EthKeyring` and the
        // Snap keyring doesn't really implement this interface (this is expected).
        keyring: keyring as unknown as EthKeyring,
        metadata: keyring.metadata,
      }),
  );

  const multichainMessenger = getMultichainAccountServiceMessenger(messenger);
  const provider = new AccountProviderWrapper(
    multichainMessenger,
    new MockTrxAccountProvider(multichainMessenger, config),
  );

  return {
    provider,
    messenger,
    keyring,
    mocks: {
      handleRequest: mockHandleRequest,
      keyring: {
        createAccount: keyring.createAccount as jest.Mock,
        discoverAccounts: keyring.discoverAccounts,
      },
    },
  };
}

describe('TrxAccountProvider', () => {
  it('getName returns Tron', () => {
    const { provider } = setup({ accounts: [] });
    expect(provider.getName()).toBe('Tron');
  });

  it('gets accounts', () => {
    const accounts = [MOCK_TRX_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const account = MOCK_TRX_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(account.id)).toStrictEqual(account);
  });

  it('throws if account does not exist', () => {
    const account = MOCK_TRX_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    const unknownAccount = MOCK_HD_ACCOUNT_1;
    expect(() => provider.getAccount(unknownAccount.id)).toThrow(
      `Unable to find account: ${unknownAccount.id}`,
    );
  });

  it('creates accounts', async () => {
    const accounts = [MOCK_TRX_ACCOUNT_1];
    const { provider, keyring } = setup({
      accounts,
    });

    const newGroupIndex = accounts.length; // Group-index are 0-based.
    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: newGroupIndex,
    });
    expect(newAccounts).toHaveLength(1);
    expect(keyring.createAccount).toHaveBeenCalled();
  });

  it('does not re-create accounts (idempotent)', async () => {
    const accounts = [MOCK_TRX_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(newAccounts).toHaveLength(1);
    expect(newAccounts[0]).toStrictEqual(MOCK_TRX_ACCOUNT_1);
  });

  it('throws if the account creation process takes too long', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    mocks.keyring.createAccount.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(MOCK_TRX_ACCOUNT_1);
        }, 4000);
      });
    });

    await expect(
      provider.createAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow('Timed out');
  });

  // Skip this test for now, since we manually inject those options upon
  // account creation, so it cannot fails (until the Tron Snap starts
  // using the new typed options).
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('throws if the created account is not BIP-44 compatible', async () => {
    const accounts = [MOCK_TRX_ACCOUNT_1];
    const { provider, mocks } = setup({
      accounts,
    });

    mocks.keyring.createAccount.mockResolvedValue({
      ...MOCK_TRX_ACCOUNT_1,
      options: {}, // No options, so it cannot be BIP-44 compatible.
    });

    await expect(
      provider.createAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow('Created account is not BIP-44 compatible');
  });

  it('discover accounts at a new group index creates an account', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    // Simulate one discovered account at the requested index.
    mocks.keyring.discoverAccounts.mockResolvedValue([
      MOCK_TRX_DISCOVERED_ACCOUNT_1,
    ]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toHaveLength(1);
    // Ensure we did go through creation path
    expect(mocks.keyring.createAccount).toHaveBeenCalled();
    // Provider should now expose one account (newly created)
    expect(provider.getAccounts()).toHaveLength(1);
  });

  it('returns existing account if it already exists at index', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_TRX_ACCOUNT_1],
    });

    // Simulate one discovered account — should resolve to the existing one
    mocks.keyring.discoverAccounts.mockResolvedValue([
      MOCK_TRX_DISCOVERED_ACCOUNT_1,
    ]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([MOCK_TRX_ACCOUNT_1]);
  });

  it('does not return any accounts if no account is discovered', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    mocks.keyring.discoverAccounts.mockResolvedValue([]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([]);
  });

  it('does not run discovery if disabled', async () => {
    const { provider } = setup({
      accounts: [MOCK_TRX_ACCOUNT_1],
      config: {
        ...TRX_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
        discovery: {
          ...TRX_ACCOUNT_PROVIDER_DEFAULT_CONFIG.discovery,
          enabled: false,
        },
      },
    });

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([]);
  });

  describe('trace functionality', () => {
    it('calls trace callback during account discovery', async () => {
      const mockTrace = jest.fn().mockImplementation(async (request, fn) => {
        expect(request.name).toBe(TraceName.SnapDiscoverAccounts);
        expect(request.data).toStrictEqual({
          provider: TRX_ACCOUNT_PROVIDER_NAME,
        });
        return await fn();
      });

      const { messenger, mocks } = setup({
        accounts: [],
      });

      // Simulate one discovered account at the requested index.
      mocks.keyring.discoverAccounts.mockResolvedValue([
        MOCK_TRX_DISCOVERED_ACCOUNT_1,
      ]);

      const multichainMessenger =
        getMultichainAccountServiceMessenger(messenger);
      const trxProvider = new MockTrxAccountProvider(
        multichainMessenger,
        undefined,
        mockTrace,
      );
      const provider = new AccountProviderWrapper(
        multichainMessenger,
        trxProvider,
      );

      const discovered = await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(discovered).toHaveLength(1);
      expect(mockTrace).toHaveBeenCalledTimes(1);
    });

    it('uses fallback trace when no trace callback is provided', async () => {
      const { provider, mocks } = setup({
        accounts: [],
      });

      mocks.keyring.discoverAccounts.mockResolvedValue([
        MOCK_TRX_DISCOVERED_ACCOUNT_1,
      ]);

      const discovered = await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(discovered).toHaveLength(1);
      // No trace errors, fallback trace should be used silently
    });

    it('trace callback is called even when discovery returns empty results', async () => {
      const mockTrace = jest.fn().mockImplementation(async (request, fn) => {
        expect(request.name).toBe(TraceName.SnapDiscoverAccounts);
        expect(request.data).toStrictEqual({
          provider: TRX_ACCOUNT_PROVIDER_NAME,
        });
        return await fn();
      });

      const { messenger, mocks } = setup({
        accounts: [],
      });

      mocks.keyring.discoverAccounts.mockResolvedValue([]);

      const multichainMessenger =
        getMultichainAccountServiceMessenger(messenger);
      const trxProvider = new MockTrxAccountProvider(
        multichainMessenger,
        undefined,
        mockTrace,
      );
      const provider = new AccountProviderWrapper(
        multichainMessenger,
        trxProvider,
      );

      const discovered = await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(discovered).toStrictEqual([]);
      expect(mockTrace).toHaveBeenCalledTimes(1);
    });

    it('trace callback receives error when discovery fails', async () => {
      const mockError = new Error('Discovery failed');
      const mockTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      const { messenger, mocks } = setup({
        accounts: [],
      });

      mocks.keyring.discoverAccounts.mockRejectedValue(mockError);

      const multichainMessenger =
        getMultichainAccountServiceMessenger(messenger);
      const trxProvider = new MockTrxAccountProvider(
        multichainMessenger,
        undefined,
        mockTrace,
      );
      const provider = new AccountProviderWrapper(
        multichainMessenger,
        trxProvider,
      );

      await expect(
        provider.discoverAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex: 0,
        }),
      ).rejects.toThrow(mockError);

      expect(mockTrace).toHaveBeenCalledTimes(1);
    });
  });
});
