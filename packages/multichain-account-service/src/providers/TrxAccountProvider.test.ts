import { isBip44Account } from '@metamask/account-api';
import { AccountCreationType, TrxScope } from '@metamask/keyring-api';
import type { KeyringCapabilities } from '@metamask/keyring-api/v2';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { SnapControllerState } from '@metamask/snaps-controllers';
import deepmerge from 'deepmerge';

import { TraceName } from '../analytics/traces.js';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_KEYRING_1,
  MOCK_TRX_ACCOUNT_1,
  MOCK_TRX_DISCOVERED_ACCOUNT_1,
  MockAccountBuilder,
  toGroupIndexRangeArray,
} from '../tests/index.js';
import type { RootMessenger, DeepPartial } from '../tests/index.js';
import { AccountProviderWrapper } from './AccountProviderWrapper.js';
import type { SnapAccountProviderConfig } from './SnapAccountProvider.js';
import {
  TRX_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
  TRX_ACCOUNT_PROVIDER_NAME,
  TrxAccountProvider,
} from './TrxAccountProvider.js';

function asConfig(
  partial: DeepPartial<SnapAccountProviderConfig>,
): SnapAccountProviderConfig {
  return deepmerge(
    TRX_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
    partial,
  ) as SnapAccountProviderConfig;
}

/**
 * v2 capabilities as declared by a fully v2-compliant Tron Snap manifest.
 * Drives the batched `createAccounts` flow and the v2 discovery path.
 */
const TRX_V2_CAPABILITIES: KeyringCapabilities = {
  scopes: [TrxScope.Mainnet],
  bip44: {
    deriveIndex: true,
    deriveIndexRange: true,
    discover: true,
  },
};

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

  createAccounts = jest.fn().mockImplementation((options) => {
    const groupIndices =
      options.type === 'bip44:derive-index'
        ? [options.groupIndex]
        : toGroupIndexRangeArray(options.range);

    return groupIndices.map((groupIndex) => {
      const found = this.accounts.find(
        (account) =>
          isBip44Account(account) &&
          account.options.entropy.groupIndex === groupIndex,
      );

      if (found) {
        return found; // Idempotent.
      }

      const account = MockAccountBuilder.from(MOCK_TRX_ACCOUNT_1)
        .withUuid()
        .withAddressSuffix(`${groupIndex}`)
        .withGroupIndex(groupIndex)
        .get();
      this.accounts.push(account);
      return account;
    });
  });

  // Add discoverAccounts method to match the provider's usage
  discoverAccounts = jest.fn().mockResolvedValue([]);

  deleteAccount = jest.fn().mockResolvedValue(undefined);
}

class MockTrxAccountProvider extends TrxAccountProvider {
  override async ensureReady(): Promise<void> {
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
 * @param options.capabilities - The Snap keyring capabilities to expose via `SnapAccountService:getCapabilities`.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts = [],
  config,
  capabilities = { scopes: [] },
}: {
  messenger?: RootMessenger;
  accounts?: InternalAccount[];
  config?: SnapAccountProviderConfig;
  capabilities?: KeyringCapabilities;
} = {}): {
  provider: AccountProviderWrapper;
  messenger: RootMessenger;
  keyring: MockTronKeyring;
  mocks: {
    handleRequest: jest.Mock;
    keyring: {
      createAccounts: jest.Mock;
      discoverAccounts: jest.Mock;
    };
    trace: jest.Mock;
  };
} {
  const keyring = new MockTronKeyring(accounts);

  messenger.registerActionHandler(
    'AccountsController:getAccounts',
    () => accounts,
  );

  messenger.registerActionHandler(
    'SnapController:getState',
    () => ({ isReady: true }) as SnapControllerState,
  );

  messenger.registerActionHandler(
    'SnapAccountService:getCapabilities',
    async () => capabilities,
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
    'KeyringController:withKeyringV2',
    async (_, operation) =>
      operation({
        keyring,
        metadata: keyring.metadata,
      }),
  );

  const mockTrace = jest.fn().mockImplementation(async (_request, fn) => {
    return await fn();
  });

  const multichainMessenger = getMultichainAccountServiceMessenger(messenger);
  const trxProvider = new MockTrxAccountProvider(
    multichainMessenger,
    config,
    mockTrace,
  );
  const accountIds = accounts.map((account) => account.id);
  trxProvider.init(accountIds);
  const provider = new AccountProviderWrapper(multichainMessenger, trxProvider);

  return {
    provider,
    messenger,
    keyring,
    mocks: {
      handleRequest: mockHandleRequest,
      keyring: {
        createAccounts: keyring.createAccounts,
        discoverAccounts: keyring.discoverAccounts,
      },
      trace: mockTrace,
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

  it('returns true if an account is compatible', () => {
    const account = MOCK_TRX_ACCOUNT_1;
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

  it('discover accounts at a new group index creates an account (v1 discovery flow)', async () => {
    const { provider, mocks } = setup({ accounts: [] });

    // Simulate one discovered account at the requested index via v1 client.discoverAccounts.
    mocks.keyring.discoverAccounts.mockResolvedValue([
      MOCK_TRX_DISCOVERED_ACCOUNT_1,
    ]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toHaveLength(1);
    // After v1 discovery, account creation goes through the v2 batched path.
    expect(mocks.keyring.createAccounts).toHaveBeenCalled();
    // Provider should now expose one account (newly created)
    expect(provider.getAccounts()).toHaveLength(1);
  });

  describe('v2 - batched', () => {
    it('creates accounts', async () => {
      const accounts = [MOCK_TRX_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
        capabilities: TRX_V2_CAPABILITIES,
      });

      const newGroupIndex = accounts.length; // Group-index are 0-based.
      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: newGroupIndex,
      });
      expect(newAccounts).toHaveLength(1);
      // Batch endpoint must be called, NOT the singular one.
      expect(mocks.keyring.createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: newGroupIndex,
      });
    });

    it('does not re-create accounts (idempotent)', async () => {
      const accounts = [MOCK_TRX_ACCOUNT_1];
      const { provider } = setup({
        accounts,
        capabilities: TRX_V2_CAPABILITIES,
      });

      const newAccounts = await provider.createAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
        type: AccountCreationType.Bip44DeriveIndex,
      });
      expect(newAccounts).toHaveLength(1);
      expect(newAccounts[0]).toStrictEqual(MOCK_TRX_ACCOUNT_1);
    });

    it('creates multiple accounts using Bip44DeriveIndexRange', async () => {
      const accounts = [MOCK_TRX_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
        capabilities: TRX_V2_CAPABILITIES,
      });

      const from = 1;
      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from, to: 3 },
      });

      expect(newAccounts).toHaveLength(3);
      // Single batch call, NOT three individual calls.
      expect(mocks.keyring.createAccounts).toHaveBeenCalledTimes(1);

      // Verify each account has the correct group index.
      for (const [index, account] of newAccounts.entries()) {
        expect(isBip44Account(account)).toBe(true);
        expect(account.options.entropy.groupIndex).toBe(from + index);
      }
    });

    it('creates accounts with range starting from 0', async () => {
      const { provider, mocks } = setup({
        accounts: [],
        capabilities: TRX_V2_CAPABILITIES,
      });

      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 2 },
      });

      expect(newAccounts).toHaveLength(3);
      expect(mocks.keyring.createAccounts).toHaveBeenCalledTimes(1);
    });

    it('creates a single account when range from equals to', async () => {
      const { provider, mocks } = setup({
        accounts: [],
        capabilities: TRX_V2_CAPABILITIES,
      });

      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 5, to: 5 },
      });

      expect(newAccounts).toHaveLength(1);
      expect(mocks.keyring.createAccounts).toHaveBeenCalledTimes(1);
      expect(
        isBip44Account(newAccounts[0]) &&
          newAccounts[0].options.entropy.groupIndex,
      ).toBe(5);
    });

    it('throws if the account creation process takes too long', async () => {
      const { provider, mocks } = setup({
        accounts: [],
        capabilities: TRX_V2_CAPABILITIES,
      });

      mocks.keyring.createAccounts.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([MOCK_TRX_ACCOUNT_1]), 4000);
          }),
      );

      await expect(
        provider.createAccounts({
          type: AccountCreationType.Bip44DeriveIndex,
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex: 0,
        }),
      ).rejects.toThrow('Timed out');
    });
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

  it('returns no accounts when a v2 Snap does not support bip44:discover', async () => {
    const { provider, mocks } = setup({
      accounts: [],
      capabilities: {
        scopes: [TrxScope.Mainnet],
        bip44: { deriveIndex: true, deriveIndexRange: true },
      },
    });

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([]);
    expect(mocks.keyring.createAccounts).not.toHaveBeenCalled();
  });

  it('does not run discovery if disabled', async () => {
    const { provider } = setup({
      accounts: [MOCK_TRX_ACCOUNT_1],
      config: asConfig({
        discovery: {
          enabled: false,
        },
      }),
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
      expect(mocks.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          name: TraceName.SnapDiscoverAccounts,
          data: { provider: TRX_ACCOUNT_PROVIDER_NAME },
        }),
        expect.any(Function),
      );
    });

    it('uses fallback trace when no trace callback is provided', async () => {
      const { messenger, mocks } = setup({ accounts: [] });

      mocks.keyring.discoverAccounts.mockResolvedValue([
        MOCK_TRX_DISCOVERED_ACCOUNT_1,
      ]);

      const multichainMessenger =
        getMultichainAccountServiceMessenger(messenger);
      // No trace callback (defaults to `traceFallback`).
      const trxProvider = new MockTrxAccountProvider(multichainMessenger);
      const provider = new AccountProviderWrapper(
        multichainMessenger,
        trxProvider,
      );

      const discovered = await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(discovered).toHaveLength(1);
    });

    it('trace callback is called even when discovery returns empty results', async () => {
      const { provider, mocks } = setup({
        accounts: [],
      });

      mocks.keyring.discoverAccounts.mockResolvedValue([]);

      const discovered = await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      expect(discovered).toStrictEqual([]);
      expect(mocks.trace).toHaveBeenCalledTimes(1);
    });

    it('trace callback receives error when discovery fails', async () => {
      const mockError = new Error('Discovery failed');
      const { provider, mocks } = setup({
        accounts: [],
      });

      mocks.keyring.discoverAccounts.mockRejectedValue(mockError);

      await expect(
        provider.discoverAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex: 0,
        }),
      ).rejects.toThrow(mockError);

      expect(mocks.trace).toHaveBeenCalledTimes(1);
    });
  });

  describe('isDisabled', () => {
    it('returns false when the provider is enabled (default)', () => {
      const { provider } = setup();
      expect(provider.isDisabled()).toBe(false);
    });

    it('returns true after setEnabled(false)', () => {
      const { provider } = setup();
      provider.setEnabled(false);
      expect(provider.isDisabled()).toBe(true);
    });

    it('returns false after re-enabling', () => {
      const { provider } = setup();
      provider.setEnabled(false);
      provider.setEnabled(true);
      expect(provider.isDisabled()).toBe(false);
    });
  });
});
