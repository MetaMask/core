/* eslint-disable jsdoc/require-jsdoc */
import type { Bip44Account } from '@metamask/account-api';
import { isBip44Account } from '@metamask/account-api';
import type { Messenger } from '@metamask/base-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType, SolAccountType } from '@metamask/keyring-api';
import { KeyringTypes, type KeyringObject } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { MultichainAccountService } from './MultichainAccountService';
import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HARDWARE_ACCOUNT_1,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MOCK_HD_KEYRING_1,
  MOCK_HD_KEYRING_2,
  MOCK_SNAP_ACCOUNT_1,
  MOCK_SNAP_ACCOUNT_2,
  MockAccountBuilder,
} from './tests';
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountServiceActions,
  MultichainAccountServiceEvents,
  MultichainAccountServiceMessenger,
} from './types';

// Mock providers.
jest.mock('./providers/EvmAccountProvider', () => {
  return {
    ...jest.requireActual('./providers/EvmAccountProvider'),
    EvmAccountProvider: jest.fn(),
  };
});
jest.mock('./providers/SolAccountProvider', () => {
  return {
    ...jest.requireActual('./providers/SolAccountProvider'),
    SolAccountProvider: jest.fn(),
  };
});

type MockAccountProvider = {
  accounts: InternalAccount[];
  getAccount: jest.Mock;
  getAccounts: jest.Mock;
  createAccounts: jest.Mock;
  discoverAndCreateAccounts: jest.Mock;
};
type Mocks = {
  listMultichainAccounts: jest.Mock;
  EvmAccountProvider: MockAccountProvider;
  SolAccountProvider: MockAccountProvider;
};

function mockAccountProvider<Provider>(
  providerClass: new (messenger: MultichainAccountServiceMessenger) => Provider,
  mocks: MockAccountProvider,
  accounts: InternalAccount[],
  type: KeyringAccount['type'],
) {
  jest
    .mocked(providerClass)
    .mockImplementation(() => mocks as unknown as Provider);

  // You can mock this and all other mocks will re-use that list
  // of accounts.
  mocks.accounts = accounts;

  const getAccounts = () =>
    mocks.accounts.filter(
      (account) => isBip44Account(account) && account.type === type,
    );

  mocks.getAccounts.mockImplementation(getAccounts);
  mocks.getAccount.mockImplementation(
    (id: Bip44Account<InternalAccount>['id']) =>
      // Assuming this never fails.
      getAccounts().find((account) => account.id === id),
  );
}

function setup({
  messenger = getRootMessenger(),
  keyrings = [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
  accounts,
}: {
  messenger?: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  keyrings?: KeyringObject[];
  accounts?: InternalAccount[];
} = {}): {
  service: MultichainAccountService;
  messenger: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    listMultichainAccounts: jest.fn(),
    EvmAccountProvider: {
      accounts: [],
      getAccount: jest.fn(),
      getAccounts: jest.fn(),
      createAccounts: jest.fn(),
      discoverAndCreateAccounts: jest.fn(),
    },
    SolAccountProvider: {
      accounts: [],
      getAccount: jest.fn(),
      getAccounts: jest.fn(),
      createAccounts: jest.fn(),
      discoverAndCreateAccounts: jest.fn(),
    },
  };

  messenger.registerActionHandler('KeyringController:getState', () => ({
    isUnlocked: true,
    keyrings,
  }));

  if (accounts) {
    mocks.listMultichainAccounts.mockImplementation(() => accounts);

    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      mocks.listMultichainAccounts,
    );

    mockAccountProvider<EvmAccountProvider>(
      EvmAccountProvider,
      mocks.EvmAccountProvider,
      accounts,
      EthAccountType.Eoa,
    );
    mockAccountProvider<SolAccountProvider>(
      SolAccountProvider,
      mocks.SolAccountProvider,
      accounts,
      SolAccountType.DataAccount,
    );
  }

  const service = new MultichainAccountService({
    messenger: getMultichainAccountServiceMessenger(messenger),
  });
  service.init();

  return { service, messenger, mocks };
}

describe('MultichainAccountService', () => {
  describe('getMultichainAccounts', () => {
    it('gets multichain accounts', () => {
      const { service } = setup({
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
          MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
          // Wallet 2:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
            .withEntropySource(MOCK_HD_KEYRING_2.metadata.id)
            .withGroupIndex(0)
            .get(),
          // Not HD accounts
          MOCK_SNAP_ACCOUNT_2,
          MOCK_HARDWARE_ACCOUNT_1,
        ],
      });

      expect(
        service.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        }),
      ).toHaveLength(1);
      expect(
        service.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toHaveLength(1);
    });

    it('gets multichain accounts with multiple wallets', () => {
      const { service } = setup({
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
          MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(1)
            .get(),
        ],
      });

      const multichainAccounts = service.getMultichainAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });
      expect(multichainAccounts).toHaveLength(2); // Group index 0 + 1.

      const internalAccounts0 = multichainAccounts[0].getAccounts();
      expect(internalAccounts0).toHaveLength(1); // Just EVM.
      expect(internalAccounts0[0].type).toBe(EthAccountType.Eoa);

      const internalAccounts1 = multichainAccounts[1].getAccounts();
      expect(internalAccounts1).toHaveLength(1); // Just SOL.
      expect(internalAccounts1[0].type).toBe(SolAccountType.DataAccount);
    });

    it('throws if trying to access an unknown wallet', () => {
      const { service } = setup({
        keyrings: [MOCK_HD_KEYRING_1],
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
        ],
      });

      // Wallet 2 should not exist, thus, this should throw.
      expect(() =>
        // NOTE: We use `getMultichainAccounts` which uses `#getWallet` under the hood.
        service.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toThrow('Unknown wallet, no wallet matching this entropy source');
    });
  });

  describe('getMultichainAccount', () => {
    it('gets a specific multichain account', () => {
      const accounts = [
        // Wallet 1:
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(0)
          .get(),
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(1)
          .get(),
      ];
      const { service } = setup({
        accounts,
      });

      const groupIndex = 1;
      const multichainAccount = service.getMultichainAccount({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex,
      });
      expect(multichainAccount.index).toBe(groupIndex);

      const internalAccounts = multichainAccount.getAccounts();
      expect(internalAccounts).toHaveLength(1);
      expect(internalAccounts[0]).toStrictEqual(accounts[1]);
    });

    it('throws if trying to access an out-of-bound group index', () => {
      const { service } = setup({
        accounts: [
          // Wallet 1:
          MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
            .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
            .withGroupIndex(0)
            .get(),
        ],
      });

      const groupIndex = 1;
      expect(() =>
        service.getMultichainAccount({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex,
        }),
      ).toThrow(`No multichain account for index: ${groupIndex}`);
    });
  });

  describe('on KeyringController:stateChange', () => {
    it('re-sets the internal wallets if a new entropy source is being added', () => {
      const keyrings = [MOCK_HD_KEYRING_1];
      const accounts = [
        // Wallet 1:
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(0)
          .get(),
      ];
      const { service, messenger, mocks } = setup({
        keyrings,
        accounts,
      });

      // This wallet does not exist yet.
      expect(() =>
        service.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toThrow('Unknown wallet, no wallet matching this entropy source');

      // Simulate new keyring being added.
      keyrings.push(MOCK_HD_KEYRING_2);
      // NOTE: We also need to update the account list now, since accounts
      // are being used as soon as we construct the multichain account
      // wallet.
      accounts.push(
        // Wallet 2:
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
          .withEntropySource(MOCK_HD_KEYRING_2.metadata.id)
          .withGroupIndex(0)
          .get(),
      );
      mocks.EvmAccountProvider.accounts = accounts;
      messenger.publish(
        'KeyringController:stateChange',
        {
          isUnlocked: true,
          keyrings,
        },
        [],
      );

      // We should now be able to query that wallet.
      expect(
        service.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toHaveLength(1);
    });
  });

  describe('getMultichainAccountAndWallet', () => {
    const entropy1 = 'entropy-1';
    const entropy2 = 'entropy-2';

    const account1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withId('mock-id-1')
      .withEntropySource(entropy1)
      .withGroupIndex(0)
      .get();
    const account2 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withId('mock-id-2')
      .withEntropySource(entropy1)
      .withGroupIndex(1)
      .get();
    const account3 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withId('mock-id-3')
      .withEntropySource(entropy2)
      .withGroupIndex(0)
      .get();

    const keyrings: KeyringObject[] = [
      {
        type: KeyringTypes.hd,
        accounts: [account1.address, account2.address],
        metadata: { id: entropy1, name: '' },
      },
      {
        type: KeyringTypes.hd,
        accounts: [account2.address],
        metadata: { id: entropy2, name: '' },
      },
    ];

    it('gets the wallet and multichain account for a given account ID', () => {
      const accounts = [account1, account2, account3];
      const { service } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet(entropy1);
      const wallet2 = service.getMultichainAccountWallet(entropy2);

      const [multichainAccount1, multichainAccount2] =
        wallet1.getMultichainAccounts();
      const [multichainAccount3] = wallet2.getMultichainAccounts();

      const walletAndMultichainAccount1 = service.getMultichainAccountAndWallet(
        account1.id,
      );
      const walletAndMultichainAccount2 = service.getMultichainAccountAndWallet(
        account2.id,
      );
      const walletAndMultichainAccount3 = service.getMultichainAccountAndWallet(
        account3.id,
      );

      // NOTE: We use `toBe` here, cause we want to make sure we use the same
      // references with `get*` service's methods.
      expect(walletAndMultichainAccount1?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount1?.multichainAccount).toBe(
        multichainAccount1,
      );

      expect(walletAndMultichainAccount2?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount2?.multichainAccount).toBe(
        multichainAccount2,
      );

      expect(walletAndMultichainAccount3?.wallet).toBe(wallet2);
      expect(walletAndMultichainAccount3?.multichainAccount).toBe(
        multichainAccount3,
      );
    });

    it('syncs the appropriate wallet and update reverse mapping on AccountsController:accountAdded', () => {
      const accounts = [account1, account3]; // No `account2` for now.
      const { service, messenger, mocks } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet(entropy1);
      expect(wallet1.getMultichainAccounts()).toHaveLength(1);

      // Now we're adding `account2`.
      mocks.EvmAccountProvider.accounts = [account1, account2];
      messenger.publish('AccountsController:accountAdded', account2);
      expect(wallet1.getMultichainAccounts()).toHaveLength(2);

      const [multichainAccount1, multichainAccount2] =
        wallet1.getMultichainAccounts();

      const walletAndMultichainAccount1 = service.getMultichainAccountAndWallet(
        account1.id,
      );
      const walletAndMultichainAccount2 = service.getMultichainAccountAndWallet(
        account2.id,
      );

      // NOTE: We use `toBe` here, cause we want to make sure we use the same
      // references with `get*` service's methods.
      expect(walletAndMultichainAccount1?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount1?.multichainAccount).toBe(
        multichainAccount1,
      );

      expect(walletAndMultichainAccount2?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount2?.multichainAccount).toBe(
        multichainAccount2,
      );
    });

    it('ignores non-BIP-44 accounts on AccountsController:accountAdded', () => {
      const accounts = [account1];
      const { service, messenger, mocks } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet(entropy1);
      const oldMultichainAccounts = wallet1.getMultichainAccounts();
      expect(oldMultichainAccounts).toHaveLength(1);
      expect(oldMultichainAccounts[0].getAccounts()).toHaveLength(1);

      // Now we're publishing a new account that is not BIP-44 compatible.
      messenger.publish('AccountsController:accountAdded', MOCK_SNAP_ACCOUNT_2);

      const newMultichainAccounts = wallet1.getMultichainAccounts();
      expect(newMultichainAccounts).toHaveLength(1);
      expect(newMultichainAccounts[0].getAccounts()).toHaveLength(1);
    });

    it('syncs the appropriate wallet and update reverse mapping on AccountsController:accountRemoved', () => {
      const accounts = [account1, account2];
      const { service, messenger, mocks } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet(entropy1);
      expect(wallet1.getMultichainAccounts()).toHaveLength(2);

      // Now we're removing `account2`.
      mocks.EvmAccountProvider.accounts = [account1];
      messenger.publish('AccountsController:accountRemoved', account2.id);
      expect(wallet1.getMultichainAccounts()).toHaveLength(1);

      const walletAndMultichainAccount2 = service.getMultichainAccountAndWallet(
        account2.id,
      );

      expect(walletAndMultichainAccount2).toBeUndefined();
    });
  });
});
