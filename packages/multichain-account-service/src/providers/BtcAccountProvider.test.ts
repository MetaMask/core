import { isBip44Account } from '@metamask/account-api';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import { AccountCreationType, BtcAccountType } from '@metamask/keyring-api';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import { SnapControllerState } from '@metamask/snaps-controllers';

import { AccountProviderWrapper } from './AccountProviderWrapper';
import {
  BTC_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
  BTC_ACCOUNT_PROVIDER_NAME,
  BtcAccountProvider,
} from './BtcAccountProvider';
import { SnapAccountProviderConfig } from './SnapAccountProvider';
import { TraceName } from '../constants/traces';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_BTC_P2TR_ACCOUNT_1,
  MOCK_BTC_P2WPKH_ACCOUNT_1,
  MOCK_BTC_P2TR_DISCOVERED_ACCOUNT_1,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_KEYRING_1,
  MockAccountBuilder,
} from '../tests';
import type { RootMessenger } from '../tests';

class MockBtcKeyring {
  readonly type = 'MockBtcKeyring';

  readonly metadata: KeyringMetadata = {
    id: 'mock-btc-keyring-id',
    name: '',
  };

  readonly accounts: InternalAccount[];

  constructor(accounts: InternalAccount[]) {
    this.accounts = accounts;
  }

  #getIndexFromDerivationPath(derivationPath: string): number {
    // eslint-disable-next-line prefer-regex-literals
    const derivationPathIndexRegex = new RegExp(
      "^m/44'/0'/0'/(?<index>[0-9]+)'$",
      'u',
    );

    const matched = derivationPath.match(derivationPathIndexRegex);
    if (matched?.groups?.index === undefined) {
      throw new Error('Unable to extract index');
    }

    const { index } = matched.groups;
    return Number(index);
  }

  createAccount: SnapKeyring['createAccount'] = jest
    .fn()
    .mockImplementation((_, { derivationPath, index, ...options }) => {
      // Determine the group index to use - either from derivationPath parsing, explicit index, or fallback
      let groupIndex: number;

      if (derivationPath !== undefined) {
        groupIndex = this.#getIndexFromDerivationPath(derivationPath);
      } else if (index !== undefined) {
        groupIndex = index;
      } else {
        groupIndex = this.accounts.length;
      }

      // Check if an account already exists for this group index AND account type (idempotent behavior)
      const found = this.accounts.find(
        (account) =>
          isBip44Account(account) &&
          account.options.entropy.groupIndex === groupIndex &&
          account.type === options.addressType,
      );

      if (found) {
        return found; // Idempotent.
      }

      // Create new account with the correct group index
      const baseAccount =
        options.addressType === BtcAccountType.P2wpkh
          ? MOCK_BTC_P2WPKH_ACCOUNT_1
          : MOCK_BTC_P2TR_ACCOUNT_1;
      const account = MockAccountBuilder.from(baseAccount)
        .withUuid()
        .withAddressSuffix(`${this.accounts.length}`)
        .withGroupIndex(groupIndex)
        .get();
      this.accounts.push(account);

      return account;
    });
}
class MockBtcAccountProvider extends BtcAccountProvider {
  override async ensureCanUseSnapPlatform(): Promise<void> {
    // Override to avoid waiting during tests.
  }
}

/**
 * Sets up a BtcAccountProvider for testing.
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
  keyring: MockBtcKeyring;
  mocks: {
    handleRequest: jest.Mock;
    keyring: {
      createAccount: jest.Mock;
    };
  };
} {
  const keyring = new MockBtcKeyring(accounts);

  messenger.registerActionHandler(
    'AccountsController:getAccounts',
    () => accounts,
  );

  messenger.registerActionHandler(
    'SnapController:getState',
    () => ({ isReady: true }) as SnapControllerState,
  );

  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    () => accounts,
  );

  const mockGetAccount = jest.fn().mockImplementation((id) => {
    return keyring.accounts.find((account) => account.id === id);
  });
  messenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount,
  );

  const mockHandleRequest = jest
    .fn()
    .mockImplementation((address: string) =>
      keyring.accounts.find((account) => account.address === address),
    );
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
  const btcProvider = new MockBtcAccountProvider(multichainMessenger, config);
  const accountIds = accounts.map((account) => account.id);
  btcProvider.init(accountIds);
  const provider = new AccountProviderWrapper(multichainMessenger, btcProvider);

  return {
    provider,
    messenger,
    keyring,
    mocks: {
      handleRequest: mockHandleRequest,
      keyring: {
        createAccount: keyring.createAccount as jest.Mock,
      },
    },
  };
}

describe('BtcAccountProvider', () => {
  it('getName returns Bitcoin', () => {
    const { provider } = setup({ accounts: [] });
    expect(provider.getName()).toBe('Bitcoin');
  });

  it('gets accounts', () => {
    const accounts = [MOCK_BTC_P2WPKH_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const account = MOCK_BTC_P2WPKH_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(account.id)).toStrictEqual(account);
  });

  it('throws if account does not exist', () => {
    const account = MOCK_BTC_P2TR_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    const unknownAccount = MOCK_HD_ACCOUNT_1;
    expect(() => provider.getAccount(unknownAccount.id)).toThrow(
      `Unable to find account: ${unknownAccount.id}`,
    );
  });

  it('returns true if an account is compatible', () => {
    const account = MOCK_BTC_P2WPKH_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });
    expect(provider.isAccountCompatible(account)).toBe(true);
  });

  it('returns false if an account is not compatible', () => {
    const account = MOCK_HD_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });
    expect(provider.isAccountCompatible(account)).toBe(false);
  });

  it('creates accounts', async () => {
    const accounts = [MOCK_BTC_P2WPKH_ACCOUNT_1];
    const { provider, keyring } = setup({
      accounts,
    });

    const newGroupIndex = accounts.length; // Group-index are 0-based.
    const newAccounts = await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndex,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: newGroupIndex,
    });
    expect(newAccounts).toHaveLength(1);
    expect(keyring.createAccount).toHaveBeenCalled();
  });

  it('does not re-create accounts (idempotent)', async () => {
    const accounts = [MOCK_BTC_P2WPKH_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndex,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(newAccounts).toHaveLength(1);
    expect(newAccounts[0]).toStrictEqual(MOCK_BTC_P2WPKH_ACCOUNT_1);
  });

  it('throws if the account creation process takes too long', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    mocks.keyring.createAccount.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(MOCK_BTC_P2TR_ACCOUNT_1);
        }, 4000);
      });
    });

    await expect(
      provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow('Timed out');
  });

  // Skip this test for now, since we manually inject those options upon
  // account creation, so it cannot fails (until the Bitcoin Snap starts
  // using the new typed options).
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('throws if the created account is not BIP-44 compatible', async () => {
    const accounts = [MOCK_BTC_P2TR_ACCOUNT_1];
    const { provider, mocks } = setup({
      accounts,
    });

    mocks.keyring.createAccount.mockResolvedValue({
      ...MOCK_BTC_P2TR_ACCOUNT_1,
      options: {}, // No options, so it cannot be BIP-44 compatible.
    });

    await expect(
      provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow('Created account is not BIP-44 compatible');
  });

  it('throws an error when type is not "bip44:derive-index"', async () => {
    const { provider } = setup();

    await expect(
      provider.createAccounts({
        // @ts-expect-error Testing invalid type handling.
        type: 'unsupported-type',
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow(
      'Unsupported create account option type: unsupported-type',
    );
  });

  it('discover accounts at a new group index creates an account', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    // Simulate one discovered account at the requested index.
    mocks.handleRequest.mockReturnValue([MOCK_BTC_P2TR_DISCOVERED_ACCOUNT_1]);

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
      accounts: [MOCK_BTC_P2WPKH_ACCOUNT_1],
    });

    // Simulate one discovered account — should resolve to the existing one
    mocks.handleRequest.mockReturnValue([MOCK_BTC_P2TR_DISCOVERED_ACCOUNT_1]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([MOCK_BTC_P2WPKH_ACCOUNT_1]);
  });

  it('does not return any accounts if no account is discovered', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    mocks.handleRequest.mockReturnValue([]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([]);
  });

  it('does not run discovery if disabled', async () => {
    const { provider } = setup({
      accounts: [MOCK_BTC_P2WPKH_ACCOUNT_1],
      config: {
        ...BTC_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
        discovery: {
          ...BTC_ACCOUNT_PROVIDER_DEFAULT_CONFIG.discovery,
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
          provider: BTC_ACCOUNT_PROVIDER_NAME,
        });
        return await fn();
      });

      const { messenger, mocks } = setup({
        accounts: [],
      });

      // Simulate one discovered account at the requested index.
      mocks.handleRequest.mockReturnValue([MOCK_BTC_P2TR_DISCOVERED_ACCOUNT_1]);

      const multichainMessenger =
        getMultichainAccountServiceMessenger(messenger);
      const btcProvider = new MockBtcAccountProvider(
        multichainMessenger,
        undefined,
        mockTrace,
      );
      const provider = new AccountProviderWrapper(
        multichainMessenger,
        btcProvider,
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

      mocks.handleRequest.mockReturnValue([MOCK_BTC_P2TR_DISCOVERED_ACCOUNT_1]);

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
          provider: BTC_ACCOUNT_PROVIDER_NAME,
        });
        return await fn();
      });

      const { messenger, mocks } = setup({
        accounts: [],
      });

      mocks.handleRequest.mockReturnValue([]);

      const multichainMessenger =
        getMultichainAccountServiceMessenger(messenger);
      const btcProvider = new MockBtcAccountProvider(
        multichainMessenger,
        undefined,
        mockTrace,
      );
      const provider = new AccountProviderWrapper(
        multichainMessenger,
        btcProvider,
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

      mocks.handleRequest.mockRejectedValue(mockError);

      const multichainMessenger =
        getMultichainAccountServiceMessenger(messenger);
      const btcProvider = new MockBtcAccountProvider(
        multichainMessenger,
        undefined,
        mockTrace,
      );
      const provider = new AccountProviderWrapper(
        multichainMessenger,
        btcProvider,
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
