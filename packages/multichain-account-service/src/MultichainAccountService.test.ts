/* eslint-disable jsdoc/require-jsdoc */

import type { Messenger } from '@metamask/base-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType, SolAccountType } from '@metamask/keyring-api';
import { KeyringTypes, type KeyringObject } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { MultichainAccountService } from './MultichainAccountService';
import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import type { MockAccountProvider } from './tests';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  makeMockAccountProvider,
  MOCK_HARDWARE_ACCOUNT_1,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MOCK_HD_KEYRING_1,
  MOCK_HD_KEYRING_2,
  MOCK_SNAP_ACCOUNT_1,
  MOCK_SNAP_ACCOUNT_2,
  MockAccountBuilder,
  setupAccountProvider,
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

type Mocks = {
  KeyringController: {
    keyrings: KeyringObject[];
    getState: jest.Mock;
  };
  AccountsController: {
    listMultichainAccounts: jest.Mock;
  };
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

  setupAccountProvider({
    mocks,
    accounts,
    filter: (account) => account.type === type,
  });
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
    KeyringController: {
      keyrings,
      getState: jest.fn(),
    },
    AccountsController: {
      listMultichainAccounts: jest.fn(),
    },
    EvmAccountProvider: makeMockAccountProvider(),
    SolAccountProvider: makeMockAccountProvider(),
  };

  mocks.KeyringController.getState.mockImplementation(() => ({
    isUnlocked: true,
    keyrings: mocks.KeyringController.keyrings,
  }));

  messenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );

  if (accounts) {
    mocks.AccountsController.listMultichainAccounts.mockImplementation(
      () => accounts,
    );

    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      mocks.AccountsController.listMultichainAccounts,
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
  describe('getMultichainAccountGroups', () => {
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
        service.getMultichainAccountGroups({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        }),
      ).toHaveLength(1);
      expect(
        service.getMultichainAccountGroups({
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

      const groups = service.getMultichainAccountGroups({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });
      expect(groups).toHaveLength(2); // Group index 0 + 1.

      const internalAccounts0 = groups[0].getAccounts();
      expect(internalAccounts0).toHaveLength(1); // Just EVM.
      expect(internalAccounts0[0].type).toBe(EthAccountType.Eoa);

      const internalAccounts1 = groups[1].getAccounts();
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
        // NOTE: We use `getMultichainAccountGroups` which uses `#getWallet` under the hood.
        service.getMultichainAccountGroups({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toThrow('Unknown wallet, no wallet matching this entropy source');
    });
  });

  describe('getMultichainAccountGroup', () => {
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
      const group = service.getMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex,
      });
      expect(group.index).toBe(groupIndex);

      const internalAccounts = group.getAccounts();
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
        service.getMultichainAccountGroup({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex,
        }),
      ).toThrow(`No multichain account for index: ${groupIndex}`);
    });
  });

  describe('getAccountContext', () => {
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

    const keyring1 = {
      type: KeyringTypes.hd,
      accounts: [account1.address, account2.address],
      metadata: { id: entropy1, name: '' },
    };
    const keyring2 = {
      type: KeyringTypes.hd,
      accounts: [account2.address],
      metadata: { id: entropy2, name: '' },
    };

    const keyrings: KeyringObject[] = [keyring1, keyring2];

    it('gets the wallet and multichain account for a given account ID', () => {
      const accounts = [account1, account2, account3];
      const { service } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      const wallet2 = service.getMultichainAccountWallet({
        entropySource: entropy2,
      });

      const [multichainAccount1, multichainAccount2] =
        wallet1.getMultichainAccountGroups();
      const [multichainAccount3] = wallet2.getMultichainAccountGroups();

      const walletAndMultichainAccount1 = service.getAccountContext(
        account1.id,
      );
      const walletAndMultichainAccount2 = service.getAccountContext(
        account2.id,
      );
      const walletAndMultichainAccount3 = service.getAccountContext(
        account3.id,
      );

      // NOTE: We use `toBe` here, cause we want to make sure we use the same
      // references with `get*` service's methods.
      expect(walletAndMultichainAccount1?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount1?.group).toBe(multichainAccount1);

      expect(walletAndMultichainAccount2?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount2?.group).toBe(multichainAccount2);

      expect(walletAndMultichainAccount3?.wallet).toBe(wallet2);
      expect(walletAndMultichainAccount3?.group).toBe(multichainAccount3);
    });

    it('syncs the appropriate wallet and update reverse mapping on AccountsController:accountAdded', () => {
      const accounts = [account1, account3]; // No `account2` for now.
      const { service, messenger, mocks } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(1);

      // Now we're adding `account2`.
      mocks.EvmAccountProvider.accounts = [account1, account2];
      messenger.publish('AccountsController:accountAdded', account2);
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(2);

      const [multichainAccount1, multichainAccount2] =
        wallet1.getMultichainAccountGroups();

      const walletAndMultichainAccount1 = service.getAccountContext(
        account1.id,
      );
      const walletAndMultichainAccount2 = service.getAccountContext(
        account2.id,
      );

      // NOTE: We use `toBe` here, cause we want to make sure we use the same
      // references with `get*` service's methods.
      expect(walletAndMultichainAccount1?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount1?.group).toBe(multichainAccount1);

      expect(walletAndMultichainAccount2?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount2?.group).toBe(multichainAccount2);
    });

    it('syncs the appropriate multichain account and update reverse mapping on AccountsController:accountAdded', () => {
      const otherAccount1 = MockAccountBuilder.from(account2)
        .withGroupIndex(0)
        .get();

      const accounts = [account1]; // No `otherAccount1` for now.
      const { service, messenger, mocks } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(1);

      // Now we're adding `account2`.
      mocks.EvmAccountProvider.accounts = [account1, otherAccount1];
      messenger.publish('AccountsController:accountAdded', otherAccount1);
      // Still 1, that's the same multichain account, but a new "blockchain
      // account" got added.
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(1);

      const [multichainAccount1] = wallet1.getMultichainAccountGroups();

      const walletAndMultichainAccount1 = service.getAccountContext(
        account1.id,
      );
      const walletAndMultichainOtherAccount1 = service.getAccountContext(
        otherAccount1.id,
      );

      // NOTE: We use `toBe` here, cause we want to make sure we use the same
      // references with `get*` service's methods.
      expect(walletAndMultichainAccount1?.wallet).toBe(wallet1);
      expect(walletAndMultichainAccount1?.group).toBe(multichainAccount1);

      expect(walletAndMultichainOtherAccount1?.wallet).toBe(wallet1);
      expect(walletAndMultichainOtherAccount1?.group).toBe(multichainAccount1);
    });

    it('creates new detected wallets and update reverse mapping on AccountsController:accountAdded', () => {
      const accounts = [account1, account2]; // No `account3` for now (associated with "Wallet 2").
      const { service, messenger, mocks } = setup({
        accounts,
        keyrings: [keyring1],
      });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(2);

      // No wallet 2 yet.
      expect(() =>
        service.getMultichainAccountWallet({ entropySource: entropy2 }),
      ).toThrow('Unknown wallet, no wallet matching this entropy source');

      // Now we're adding `account3`.
      mocks.KeyringController.keyrings = [keyring1, keyring2];
      mocks.EvmAccountProvider.accounts = [account1, account2, account3];
      messenger.publish('AccountsController:accountAdded', account3);
      const wallet2 = service.getMultichainAccountWallet({
        entropySource: entropy2,
      });
      expect(wallet2).toBeDefined();
      expect(wallet2.getMultichainAccountGroups()).toHaveLength(1);

      const [multichainAccount3] = wallet2.getMultichainAccountGroups();

      const walletAndMultichainAccount3 = service.getAccountContext(
        account3.id,
      );

      // NOTE: We use `toBe` here, cause we want to make sure we use the same
      // references with `get*` service's methods.
      expect(walletAndMultichainAccount3?.wallet).toBe(wallet2);
      expect(walletAndMultichainAccount3?.group).toBe(multichainAccount3);
    });

    it('ignores non-BIP-44 accounts on AccountsController:accountAdded', () => {
      const accounts = [account1];
      const { service, messenger } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      const oldMultichainAccounts = wallet1.getMultichainAccountGroups();
      expect(oldMultichainAccounts).toHaveLength(1);
      expect(oldMultichainAccounts[0].getAccounts()).toHaveLength(1);

      // Now we're publishing a new account that is not BIP-44 compatible.
      messenger.publish('AccountsController:accountAdded', MOCK_SNAP_ACCOUNT_2);

      const newMultichainAccounts = wallet1.getMultichainAccountGroups();
      expect(newMultichainAccounts).toHaveLength(1);
      expect(newMultichainAccounts[0].getAccounts()).toHaveLength(1);
    });

    it('syncs the appropriate wallet and update reverse mapping on AccountsController:accountRemoved', () => {
      const accounts = [account1, account2];
      const { service, messenger, mocks } = setup({ accounts, keyrings });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(2);

      // Now we're removing `account2`.
      mocks.EvmAccountProvider.accounts = [account1];
      messenger.publish('AccountsController:accountRemoved', account2.id);
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(1);

      const walletAndMultichainAccount2 = service.getAccountContext(
        account2.id,
      );

      expect(walletAndMultichainAccount2).toBeUndefined();
    });
  });

  describe('createNextMultichainAccount', () => {
    it('creates the next multichain account group', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { service } = setup({ accounts: [mockEvmAccount] });

      const nextGroup = await service.createNextMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });
      expect(nextGroup.index).toBe(1);
      // NOTE: There won't be any account for this group, since we're not
      // mocking the providers.
    });
  });

  describe('createMultichainAccountGroup', () => {
    it('creates a multichain account group with the given group index', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();

      const { service } = setup({
        accounts: [mockEvmAccount, mockSolAccount],
      });

      const firstGroup = await service.createMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });

      const secondGroup = await service.createMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      });

      expect(firstGroup.index).toBe(0);
      expect(firstGroup.getAccounts()).toHaveLength(1);
      expect(firstGroup.getAccounts()[0]).toStrictEqual(mockEvmAccount);

      expect(secondGroup.index).toBe(1);
      expect(secondGroup.getAccounts()).toHaveLength(1);
      expect(secondGroup.getAccounts()[0]).toStrictEqual(mockSolAccount);
    });
  });

  describe('actions', () => {
    it('gets a multichain account with MultichainAccountService:getMultichainAccount', () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = setup({ accounts });

      const group = messenger.call(
        'MultichainAccountService:getMultichainAccountGroup',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id, groupIndex: 0 },
      );
      expect(group).toBeDefined();
    });

    it('gets multichain accounts with MultichainAccountService:getMultichainAccounts', () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = setup({ accounts });

      const groups = messenger.call(
        'MultichainAccountService:getMultichainAccountGroups',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      );
      expect(groups.length).toBeGreaterThan(0);
    });

    it('gets multichain account wallet with MultichainAccountService:getMultichainAccountWallet', () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = setup({ accounts });

      const wallet = messenger.call(
        'MultichainAccountService:getMultichainAccountWallet',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      );
      expect(wallet).toBeDefined();
    });

    it('gets multichain account wallet with MultichainAccountService:getMultichainAccountWallets', () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = setup({ accounts });

      const wallets = messenger.call(
        'MultichainAccountService:getMultichainAccountWallets',
      );
      expect(wallets.length).toBeGreaterThan(0);
    });

    it('create the next multichain account group with MultichainAccountService:createNextMultichainAccountGroup', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = setup({ accounts });

      const nextGroup = await messenger.call(
        'MultichainAccountService:createNextMultichainAccountGroup',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      );
      expect(nextGroup.index).toBe(1);
      // NOTE: There won't be any account for this group, since we're not
      // mocking the providers.
    });

    it('creates a multichain account group with MultichainAccountService:createMultichainAccountGroup', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = setup({ accounts });

      const firstGroup = await messenger.call(
        'MultichainAccountService:createMultichainAccountGroup',
        {
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex: 0,
        },
      );

      expect(firstGroup.index).toBe(0);
      expect(firstGroup.getAccounts()).toHaveLength(1);
      expect(firstGroup.getAccounts()[0]).toStrictEqual(MOCK_HD_ACCOUNT_1);
    });
  });
});
