import { isBip44Account } from '@metamask/account-api';
import type { Messenger } from '@metamask/base-controller';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import { BtcAccountType } from '@metamask/keyring-api';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';

import { AccountProviderWrapper } from './AccountProviderWrapper';
import { BtcAccountProvider } from './BtcAccountProvider';
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
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountServiceActions,
  MultichainAccountServiceEvents,
} from '../types';

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

/**
 * Sets up a BtcAccountProvider for testing.
 *
 * @param options - Configuration options for setup.
 * @param options.messenger - An optional messenger instance to use. Defaults to a new Messenger.
 * @param options.accounts - List of accounts to use.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts = [],
}: {
  messenger?: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
} = {}): {
  provider: AccountProviderWrapper;
  messenger: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
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
    'AccountsController:listMultichainAccounts',
    () => accounts,
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
  const provider = new AccountProviderWrapper(
    multichainMessenger,
    new BtcAccountProvider(multichainMessenger),
  );

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
    const accounts = [MOCK_BTC_P2TR_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const account = MOCK_BTC_P2TR_ACCOUNT_1;
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

  it('creates accounts', async () => {
    const accounts = [MOCK_BTC_P2TR_ACCOUNT_1, MOCK_BTC_P2WPKH_ACCOUNT_1];
    const { provider, keyring } = setup({
      accounts,
    });

    const newGroupIndex = accounts.length; // Group-index are 0-based.
    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: newGroupIndex,
    });
    expect(newAccounts).toHaveLength(2);
    expect(keyring.createAccount).toHaveBeenCalled();
  });

  it('does not re-create accounts (idempotent)', async () => {
    const accounts = [MOCK_BTC_P2TR_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(newAccounts).toHaveLength(2);
    expect(newAccounts[0]).toStrictEqual(MOCK_BTC_P2TR_ACCOUNT_1);
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
    mocks.handleRequest.mockReturnValue([MOCK_BTC_P2TR_DISCOVERED_ACCOUNT_1]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toHaveLength(2);
    // Ensure we did go through creation path
    expect(mocks.keyring.createAccount).toHaveBeenCalled();
    // Provider should now expose one account (newly created)
    expect(provider.getAccounts()).toHaveLength(2);
  });

  it('returns existing account if it already exists at index', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_BTC_P2TR_ACCOUNT_1, MOCK_BTC_P2WPKH_ACCOUNT_1],
    });

    // Simulate one discovered account — should resolve to the existing one
    mocks.handleRequest.mockReturnValue([MOCK_BTC_P2TR_DISCOVERED_ACCOUNT_1]);

    const discovered = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([
      MOCK_BTC_P2TR_ACCOUNT_1,
      MOCK_BTC_P2WPKH_ACCOUNT_1,
    ]);
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
});
