import { isBip44Account } from '@metamask/account-api';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import { AccountCreationType } from '@metamask/keyring-api';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import { SnapControllerState } from '@metamask/snaps-controllers';
import type { Json } from '@metamask/utils';
import deepmerge from 'deepmerge';

import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_KEYRING_2,
  MOCK_XLM_ACCOUNT_1,
  MOCK_XLM_DISCOVERED_ACCOUNT_1,
  MockAccountBuilder,
  toGroupIndexRangeArray,
} from '../tests';
import type { RootMessenger, DeepPartial } from '../tests';
import { AccountProviderWrapper } from './AccountProviderWrapper';
import type { SnapAccountProviderConfig } from './SnapAccountProvider';
import {
  XLM_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
  XLM_ACCOUNT_PROVIDER_NAME,
  XlmAccountProvider,
} from './XlmAccountProvider';

function asConfig(
  partial: DeepPartial<SnapAccountProviderConfig>,
): SnapAccountProviderConfig {
  return deepmerge(
    XLM_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
    partial,
  ) as SnapAccountProviderConfig;
}

class MockStellarKeyring {
  readonly type = 'MockStellarKeyring';

  readonly metadata: KeyringMetadata = {
    id: 'mock-stellar-keyring-id',
    name: '',
  };

  readonly accounts: InternalAccount[];

  constructor(accounts: InternalAccount[]) {
    this.accounts = accounts;
  }

  createAccount: SnapKeyring['createAccount'] = jest
    .fn()
    .mockImplementation((_, options: Record<string, Json>) => {
      const { index } = options;
      if (typeof index === 'number') {
        const found = this.accounts.find(
          (account) =>
            isBip44Account(account) &&
            account.options.entropy.groupIndex === index,
        );

        if (found) {
          return found;
        }
      }

      const account = MockAccountBuilder.from(MOCK_XLM_ACCOUNT_1)
        .withUuid()
        .withAddressSuffix(`${this.accounts.length}`)
        .withGroupIndex(
          typeof index === 'number' ? index : this.accounts.length,
        )
        .get();
      this.accounts.push(account);

      return account;
    });

  createAccounts: SnapKeyring['createAccounts'] = jest
    .fn()
    .mockImplementation((_, options) => {
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
          return found;
        }

        const account = MockAccountBuilder.from(MOCK_XLM_ACCOUNT_1)
          .withUuid()
          .withAddressSuffix(`${groupIndex}`)
          .withGroupIndex(groupIndex)
          .get();
        this.accounts.push(account);
        return account;
      });
    });

  discoverAccounts = jest.fn().mockResolvedValue([]);
}

class MockXlmAccountProvider extends XlmAccountProvider {
  override async ensureReady(): Promise<void> {
    // Override to avoid waiting during tests.
  }
}

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
  keyring: MockStellarKeyring;
  mocks: {
    handleRequest: jest.Mock;
    keyring: {
      createAccount: jest.Mock;
      createAccounts: jest.Mock;
      discoverAccounts: jest.Mock;
    };
    trace: jest.Mock;
  };
} {
  const keyring = new MockStellarKeyring(accounts);

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
    .mockImplementation((request) => {
      if (request.request?.method === 'keyring_discoverAccounts') {
        return keyring.discoverAccounts();
      }

      return keyring.accounts.find(
        (account) => account.address === request.address,
      );
    });

  const mockTrace = jest.fn().mockImplementation(async (_request, fn) => {
    return await fn();
  });

  messenger.registerActionHandler(
    'SnapController:handleRequest',
    mockHandleRequest,
  );

  messenger.registerActionHandler(
    'KeyringController:withKeyring',
    async (_, operation) =>
      operation({
        keyring: keyring as unknown as EthKeyring,
        metadata: keyring.metadata,
      }),
  );

  const multichainMessenger = getMultichainAccountServiceMessenger(messenger);
  const xlmProvider = new MockXlmAccountProvider(
    multichainMessenger,
    config,
    mockTrace,
  );
  const accountIds = accounts.map((account) => account.id);
  xlmProvider.init(accountIds);
  const provider = new AccountProviderWrapper(multichainMessenger, xlmProvider);

  return {
    provider,
    messenger,
    keyring,
    mocks: {
      handleRequest: mockHandleRequest,
      keyring: {
        createAccount: keyring.createAccount as jest.Mock,
        createAccounts: keyring.createAccounts as jest.Mock,
        discoverAccounts: keyring.discoverAccounts,
      },
      trace: mockTrace,
    },
  };
}

describe('XlmAccountProvider', () => {
  it('getName returns Stellar', () => {
    const { provider } = setup({ accounts: [] });
    expect(provider.getName()).toBe(XLM_ACCOUNT_PROVIDER_NAME);
  });

  it('uses default config and trace callback', () => {
    const messenger = getMultichainAccountServiceMessenger(getRootMessenger());
    const provider = new XlmAccountProvider(messenger);
    expect(provider.getName()).toBe(XLM_ACCOUNT_PROVIDER_NAME);
  });

  it('returns true if an account is compatible', () => {
    const account = MOCK_XLM_ACCOUNT_1;
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

  it('returns existing account if it already exists at index', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_XLM_ACCOUNT_1],
    });

    mocks.keyring.discoverAccounts.mockResolvedValue([
      MOCK_XLM_DISCOVERED_ACCOUNT_1,
    ]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([MOCK_XLM_ACCOUNT_1]);
  });

  it('does not return any accounts if no account is discovered', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    mocks.keyring.discoverAccounts.mockResolvedValue([]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([]);
  });

  it('does not run discovery if disabled', async () => {
    const { provider } = setup({
      accounts: [MOCK_XLM_ACCOUNT_1],
      config: asConfig({
        discovery: {
          enabled: false,
        },
      }),
    });

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([]);
  });

  describe('v1', () => {
    it('uses createAccount when batching is disabled', async () => {
      const accounts = [MOCK_XLM_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
        config: asConfig({ createAccounts: { batched: false } }),
      });

      await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        groupIndex: accounts.length,
      });

      expect(mocks.keyring.createAccount).toHaveBeenCalled();
      expect(mocks.keyring.createAccounts).not.toHaveBeenCalled();
    });
  });

  describe('v2 - batched', () => {
    it('creates one account via createAccounts', async () => {
      const accounts = [MOCK_XLM_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
        config: asConfig({ createAccounts: { batched: true } }),
      });

      const newGroupIndex = accounts.length;
      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        groupIndex: newGroupIndex,
      });

      expect(newAccounts).toHaveLength(1);
      expect(mocks.keyring.createAccounts).toHaveBeenCalledWith(
        XlmAccountProvider.XLM_SNAP_ID,
        {
          type: AccountCreationType.Bip44DeriveIndex,
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
          groupIndex: newGroupIndex,
        },
      );
      expect(mocks.keyring.createAccount).not.toHaveBeenCalled();
    });

    it('creates multiple accounts using Bip44DeriveIndexRange', async () => {
      const accounts = [MOCK_XLM_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
        config: asConfig({ createAccounts: { batched: true } }),
      });

      const from = 1;
      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        range: { from, to: 3 },
      });

      expect(newAccounts).toHaveLength(3);
      expect(mocks.keyring.createAccounts).toHaveBeenCalledTimes(1);
      expect(mocks.keyring.createAccount).not.toHaveBeenCalled();

      for (const [index, account] of newAccounts.entries()) {
        expect(isBip44Account(account)).toBe(true);
        expect(account.options.entropy.groupIndex).toBe(from + index);
      }
    });
  });
});
