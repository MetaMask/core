import { isBip44Account } from '@metamask/account-api';
import type { Messenger } from '@metamask/base-controller';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';

import { SolAccountProvider } from './SolAccountProvider';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_KEYRING_1,
  MOCK_SOL_ACCOUNT_1,
  MOCK_SOL_DISCOVERED_ACCOUNT_1,
  MockAccountBuilder,
} from '../tests';
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountServiceActions,
  MultichainAccountServiceEvents,
} from '../types';
import { AccountProviderWrapper } from './AccountProviderWrapper';

class MockSolanaKeyring {
  readonly type = 'MockSolanaKeyring';

  readonly metadata: KeyringMetadata = {
    id: 'mock-solana-keyring-id',
    name: '',
  };

  readonly accounts: InternalAccount[];

  constructor(accounts: InternalAccount[]) {
    this.accounts = accounts;
  }

  #getIndexFromDerivationPath(derivationPath: string): number {
    // eslint-disable-next-line prefer-regex-literals
    const derivationPathIndexRegex = new RegExp(
      "^m/44'/501'/(?<index>[0-9]+)'/0'$",
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
    .mockImplementation((_, { derivationPath }) => {
      if (derivationPath !== undefined) {
        const index = this.#getIndexFromDerivationPath(derivationPath);
        const found = this.accounts.find(
          (account) =>
            isBip44Account(account) &&
            account.options.entropy.groupIndex === index,
        );

        if (found) {
          return found; // Idempotent.
        }
      }

      const account = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withUuid()
        .withAddressSuffix(`${this.accounts.length}`)
        .withGroupIndex(this.accounts.length)
        .get();
      this.accounts.push(account);

      return account;
    });
}

/**
 * Sets up a SolAccountProvider for testing.
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
  keyring: MockSolanaKeyring;
  mocks: {
    handleRequest: jest.Mock;
    keyring: {
      createAccount: jest.Mock;
    };
  };
} {
  const keyring = new MockSolanaKeyring(accounts);

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
    new SolAccountProvider(multichainMessenger),
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

describe('SolAccountProvider', () => {
  it('getName returns Solana', () => {
    const { provider } = setup({ accounts: [] });
    expect(provider.getName()).toBe('Solana');
  });

  it('gets accounts', () => {
    const accounts = [MOCK_SOL_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const account = MOCK_SOL_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(account.id)).toStrictEqual(account);
  });

  it('throws if account does not exist', () => {
    const account = MOCK_SOL_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    const unknownAccount = MOCK_HD_ACCOUNT_1;
    expect(() => provider.getAccount(unknownAccount.id)).toThrow(
      `Unable to find account: ${unknownAccount.id}`,
    );
  });

  it('creates accounts', async () => {
    const accounts = [MOCK_SOL_ACCOUNT_1];
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
    const accounts = [MOCK_SOL_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(newAccounts).toHaveLength(1);
    expect(newAccounts[0]).toStrictEqual(MOCK_SOL_ACCOUNT_1);
  });

  // Skip this test for now, since we manually inject those options upon
  // account creation, so it cannot fails (until the Solana Snap starts
  // using the new typed options).
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('throws if the created account is not BIP-44 compatible', async () => {
    const accounts = [MOCK_SOL_ACCOUNT_1];
    const { provider, mocks } = setup({
      accounts,
    });

    mocks.keyring.createAccount.mockResolvedValue({
      ...MOCK_SOL_ACCOUNT_1,
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
    mocks.handleRequest.mockReturnValue([MOCK_SOL_DISCOVERED_ACCOUNT_1]);

    const created = await provider.discoverAndCreateAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(created).toHaveLength(1);
    // Ensure we did go through creation path
    expect(mocks.keyring.createAccount).toHaveBeenCalled();
    // Provider should now expose one account (newly created)
    expect(provider.getAccounts()).toHaveLength(1);
  });

  it('returns existing account if it already exists at index', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_SOL_ACCOUNT_1],
    });

    // Simulate one discovered account — should resolve to the existing one
    mocks.handleRequest.mockReturnValue([MOCK_SOL_DISCOVERED_ACCOUNT_1]);

    const discovered = await provider.discoverAndCreateAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([MOCK_SOL_ACCOUNT_1]);
  });

  it('does not return any accounts if no account is discovered', async () => {
    const { provider, mocks } = setup({
      accounts: [],
    });

    mocks.handleRequest.mockReturnValue([]);

    const discovered = await provider.discoverAndCreateAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(discovered).toStrictEqual([]);
  });
});
