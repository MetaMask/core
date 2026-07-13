import { isBip44Account } from '@metamask/account-api';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import { AccountCreationType, XlmScope } from '@metamask/keyring-api';
import type { KeyringCapabilities } from '@metamask/keyring-api/v2';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { SnapControllerState } from '@metamask/snaps-controllers';
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

/**
 * v2 capabilities as declared by a fully v2-compliant Stellar Snap manifest.
 * Drives the batched `createAccounts` flow and the v2 discovery path.
 */
const XLM_V2_CAPABILITIES: KeyringCapabilities = {
  scopes: [XlmScope.Pubnet],
  bip44: {
    deriveIndex: true,
    deriveIndexRange: true,
    discover: true,
  },
};

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

  createAccounts: SnapKeyring['createAccounts'] = jest
    .fn()
    .mockImplementation((options) => {
      const groupIndices =
        options.type === 'bip44:derive-index-range'
          ? toGroupIndexRangeArray(options.range)
          : [options.groupIndex];

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

  deleteAccount = jest.fn().mockResolvedValue(undefined);
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
  capabilities = { scopes: [] },
}: {
  messenger?: RootMessenger;
  accounts?: InternalAccount[];
  config?: SnapAccountProviderConfig;
  capabilities?: KeyringCapabilities;
} = {}): {
  provider: AccountProviderWrapper;
  messenger: RootMessenger;
  keyring: MockStellarKeyring;
  mocks: {
    handleRequest: jest.Mock;
    keyring: {
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
    'KeyringController:withKeyringV2',
    async (_, operation) =>
      operation({
        keyring,
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
      capabilities: XLM_V2_CAPABILITIES,
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

  it('returns no accounts when a v2 Snap does not support bip44:discover', async () => {
    const { provider, mocks } = setup({
      accounts: [],
      capabilities: {
        scopes: [XlmScope.Pubnet],
        bip44: { deriveIndex: true, deriveIndexRange: true },
      },
    });

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([]);
    expect(mocks.keyring.createAccounts).not.toHaveBeenCalled();
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

  describe('v2 - batched', () => {
    it('creates one account via createAccounts', async () => {
      const accounts = [MOCK_XLM_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
        capabilities: XLM_V2_CAPABILITIES,
      });

      const newGroupIndex = accounts.length;
      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        groupIndex: newGroupIndex,
      });

      expect(newAccounts).toHaveLength(1);
      expect(mocks.keyring.createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        groupIndex: newGroupIndex,
      });
    });

    it('creates multiple accounts using Bip44DeriveIndexRange', async () => {
      const accounts = [MOCK_XLM_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
        capabilities: XLM_V2_CAPABILITIES,
      });

      const from = 1;
      const newAccounts = await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        range: { from, to: 3 },
      });

      expect(newAccounts).toHaveLength(3);
      expect(mocks.keyring.createAccounts).toHaveBeenCalledTimes(1);

      for (const [index, account] of newAccounts.entries()) {
        expect(isBip44Account(account)).toBe(true);
        expect(account.options.entropy.groupIndex).toBe(from + index);
      }
    });
  });
});
