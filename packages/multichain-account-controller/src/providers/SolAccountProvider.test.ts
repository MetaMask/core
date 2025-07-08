import type { Messenger } from '@metamask/base-controller';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { DiscoveredAccount } from '@metamask/keyring-api';
import { SolScope } from '@metamask/keyring-api';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';

import { SolAccountProvider } from './SolAccountProvider';
import {
  getMultichainAccountControllerMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_KEYRING_1,
  MOCK_HD_KEYRING_2,
  MOCK_SNAP_ACCOUNT_1,
  MockAccountBuilder,
} from '../tests';
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountControllerActions,
  MultichainAccountControllerEvents,
} from '../types';

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
      "m/44'/501'/(?<index>[0-9]+)'/0",
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
    .mockImplementation((_, options) => {
      if (options.derivationPath !== undefined) {
        const index = this.#getIndexFromDerivationPath(options.derivationPath);
        const found = this.accounts.find(
          (account) => account.options.index === index,
        );

        if (found) {
          return found; // Idempotent.
        }
      }

      const account = MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1)
        .withUuuid()
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
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
} = {}): {
  provider: SolAccountProvider;
  messenger: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
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
        // Snap keyring does really implement this interface (this is expected).
        keyring: keyring as unknown as EthKeyring,
        metadata: keyring.metadata,
      }),
  );

  const provider = new SolAccountProvider(
    getMultichainAccountControllerMessenger(messenger),
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
  it('gets accounts', () => {
    const { provider } = setup({
      accounts: [MOCK_SNAP_ACCOUNT_1],
    });

    const accountsForIndex0 = provider.getAccounts({
      entropySource: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
    });
    const accountsForIndex1 = provider.getAccounts({
      entropySource: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 1,
    });
    expect(accountsForIndex0).toHaveLength(1);
    expect(accountsForIndex1).toHaveLength(0);
  });

  it('gets a specific account', () => {
    const account = MOCK_SNAP_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(account.id)).toStrictEqual(account);
  });

  it('throws if account does not exist', () => {
    const account = MOCK_SNAP_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    const unknownAccount = MOCK_HD_ACCOUNT_1;
    expect(() => provider.getAccount(unknownAccount.id)).toThrow(
      `Unable to find account: ${unknownAccount.id}`,
    );
  });

  it('creates accounts', async () => {
    const accounts = [MOCK_SNAP_ACCOUNT_1];
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
    const accounts = [MOCK_SNAP_ACCOUNT_1];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(newAccounts).toHaveLength(1);
    expect(newAccounts[0]).toStrictEqual(MOCK_SNAP_ACCOUNT_1.id);
  });

  it('discover accounts', async () => {
    const { provider, mocks } = setup({
      accounts: [], // No accounts by defaults, so we can discover them
    });

    // Discovery.
    mocks.handleRequest.mockImplementationOnce(() => {
      return [
        {
          type: 'bip44',
          derivationPath: "m/44'/501'/0'/0'",
          scopes: [SolScope.Mainnet, SolScope.Devnet, SolScope.Testnet],
        } as DiscoveredAccount,
      ];
    });

    // Then, create account.
    mocks.keyring.createAccount.mockImplementationOnce(() => {
      return MOCK_SNAP_ACCOUNT_1;
    });

    const accounts = await provider.discoverAndCreateAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(accounts).toHaveLength(1);
    expect(mocks.handleRequest).toHaveBeenCalledTimes(1); // Discovery (0).
    expect(mocks.keyring.createAccount).toHaveBeenCalledTimes(1);

    // Discovery (but with no result).
    mocks.handleRequest.mockImplementationOnce(() => {
      return [];
    });

    // For now, we cannot beyond index 0 for the discovery.
    const noAccounts = await provider.discoverAndCreateAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 1,
    });
    expect(noAccounts).toHaveLength(0);
    expect(mocks.handleRequest).toHaveBeenCalledTimes(2); // Discovery (1).
  });
});
