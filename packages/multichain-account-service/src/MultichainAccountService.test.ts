import { isBip44Account } from '@metamask/account-api';
import { mnemonicPhraseToBytes } from '@metamask/key-tree';
import type { KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType, SolAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringObject } from '@metamask/keyring-controller';

import type { MultichainAccountServiceOptions } from './MultichainAccountService';
import { MultichainAccountService } from './MultichainAccountService';
import type { Bip44AccountProvider } from './providers';
import { AccountProviderWrapper } from './providers/AccountProviderWrapper';
import {
  EVM_ACCOUNT_PROVIDER_NAME,
  EvmAccountProvider,
} from './providers/EvmAccountProvider';
import {
  SOL_ACCOUNT_PROVIDER_NAME,
  SolAccountProvider,
} from './providers/SolAccountProvider';
import {
  MOCK_HARDWARE_ACCOUNT_1,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MOCK_MNEMONIC,
  MOCK_SNAP_ACCOUNT_1,
  MOCK_SNAP_ACCOUNT_2,
  MOCK_SOL_ACCOUNT_1,
  MockAccountBuilder,
} from './tests';
import {
  MOCK_HD_KEYRING_1,
  MOCK_HD_KEYRING_2,
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  makeMockAccountProvider,
  mockAsInternalAccount,
  setupNamedAccountProvider,
} from './tests';
import type { MockAccountProvider, RootMessenger } from './tests';
import type { MultichainAccountServiceMessenger } from './types';

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
    getKeyringsByType: jest.Mock;
    addNewKeyring: jest.Mock;
  };
  AccountsController: {
    listMultichainAccounts: jest.Mock;
  };
  EvmAccountProvider: MockAccountProvider;
  SolAccountProvider: MockAccountProvider;
};

function mockAccountProvider<Provider extends Bip44AccountProvider>(
  providerClass: new (messenger: MultichainAccountServiceMessenger) => Provider,
  mocks: MockAccountProvider,
  accounts: KeyringAccount[],
  type: KeyringAccount['type'],
) {
  jest.mocked(providerClass).mockImplementation((...args) => {
    mocks.constructor(...args);
    return mocks as unknown as Provider;
  });

  setupNamedAccountProvider({
    mocks,
    accounts,
    filter: (account) => account.type === type,
  });
}

async function setup({
  rootMessenger = getRootMessenger(),
  keyrings = [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
  accounts,
  providerConfigs,
}: {
  rootMessenger?: RootMessenger;
  keyrings?: KeyringObject[];
  accounts?: KeyringAccount[];
  providerConfigs?: MultichainAccountServiceOptions['providerConfigs'];
} = {}): Promise<{
  service: MultichainAccountService;
  rootMessenger: RootMessenger;
  messenger: MultichainAccountServiceMessenger;
  mocks: Mocks;
}> {
  const mocks: Mocks = {
    KeyringController: {
      keyrings,
      getState: jest.fn(),
      getKeyringsByType: jest.fn(),
      addNewKeyring: jest.fn(),
    },
    AccountsController: {
      listMultichainAccounts: jest.fn(),
    },
    EvmAccountProvider: makeMockAccountProvider(),
    SolAccountProvider: makeMockAccountProvider(),
  };

  // Required for the `assert` on `MultichainAccountWallet.createMultichainAccountGroup`.
  Object.setPrototypeOf(mocks.EvmAccountProvider, EvmAccountProvider.prototype);

  mocks.KeyringController.getState.mockImplementation(() => ({
    isUnlocked: true,
    keyrings: mocks.KeyringController.keyrings,
  }));

  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );

  rootMessenger.registerActionHandler(
    'KeyringController:getKeyringsByType',
    mocks.KeyringController.getKeyringsByType,
  );

  rootMessenger.registerActionHandler(
    'KeyringController:addNewKeyring',
    mocks.KeyringController.addNewKeyring,
  );

  if (accounts) {
    mocks.AccountsController.listMultichainAccounts.mockImplementation(
      () => accounts,
    );

    rootMessenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      mocks.AccountsController.listMultichainAccounts,
    );

    // Because we mock the entire class, this static field gets set to undefined, so we
    // force it here.
    EvmAccountProvider.NAME = EVM_ACCOUNT_PROVIDER_NAME;
    SolAccountProvider.NAME = SOL_ACCOUNT_PROVIDER_NAME;

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

  const messenger = getMultichainAccountServiceMessenger(rootMessenger);

  const service = new MultichainAccountService({
    messenger,
    providerConfigs,
  });

  await service.init();

  return {
    service,
    rootMessenger,
    messenger,
    mocks,
  };
}

describe('MultichainAccountService', () => {
  describe('constructor', () => {
    it('forwards configs to each provider', async () => {
      const providerConfigs: MultichainAccountServiceOptions['providerConfigs'] =
        {
          // NOTE: We use constants here, since `*AccountProvider` are mocked, thus, their `.NAME` will
          // be `undefined`.
          [EVM_ACCOUNT_PROVIDER_NAME]: {
            discovery: {
              timeoutMs: 1000,
              maxAttempts: 2,
              backOffMs: 1000,
            },
          },
          [SOL_ACCOUNT_PROVIDER_NAME]: {
            maxConcurrency: 3,
            discovery: {
              timeoutMs: 5000,
              maxAttempts: 4,
              backOffMs: 2000,
            },
            createAccounts: {
              timeoutMs: 3000,
            },
          },
        };

      const { mocks, messenger } = await setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_SOL_ACCOUNT_1],
        providerConfigs,
      });

      expect(mocks.EvmAccountProvider.constructor).toHaveBeenCalledWith(
        messenger,
        providerConfigs?.[EvmAccountProvider.NAME],
        expect.any(Function), // TraceCallback
      );
      expect(mocks.SolAccountProvider.constructor).toHaveBeenCalledWith(
        messenger,
        providerConfigs?.[SolAccountProvider.NAME],
        expect.any(Function), // TraceCallback
      );
    });

    it('allows optional configs for some providers', async () => {
      const providerConfigs: MultichainAccountServiceOptions['providerConfigs'] =
        {
          // NOTE: We use constants here, since `*AccountProvider` are mocked, thus, their `.NAME` will
          // be `undefined`.
          [SOL_ACCOUNT_PROVIDER_NAME]: {
            maxConcurrency: 3,
            discovery: {
              timeoutMs: 5000,
              maxAttempts: 4,
              backOffMs: 2000,
            },
            createAccounts: {
              timeoutMs: 3000,
            },
          },
          // No `EVM_ACCOUNT_PROVIDER_NAME`, cause it's optional in this test.
        };

      const { mocks, messenger } = await setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_SOL_ACCOUNT_1],
        providerConfigs,
      });

      expect(mocks.EvmAccountProvider.constructor).toHaveBeenCalledWith(
        messenger,
        undefined,
        expect.any(Function), // TraceCallback
      );
      expect(mocks.SolAccountProvider.constructor).toHaveBeenCalledWith(
        messenger,
        providerConfigs?.[SolAccountProvider.NAME],
        expect.any(Function), // TraceCallback
      );
    });
  });

  describe('getMultichainAccountGroups', () => {
    it('gets multichain accounts', async () => {
      const { service } = await setup({
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

    it('gets multichain accounts with multiple wallets', async () => {
      const { service } = await setup({
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

    it('throws if trying to access an unknown wallet', async () => {
      const { service } = await setup({
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
    it('gets a specific multichain account', async () => {
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
      const { service } = await setup({
        accounts,
      });

      const groupIndex = 1;
      const group = service.getMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex,
      });
      expect(group.groupIndex).toBe(groupIndex);

      const internalAccounts = group.getAccounts();
      expect(internalAccounts).toHaveLength(1);
      expect(internalAccounts[0]).toStrictEqual(accounts[1]);
    });

    it('throws if trying to access an out-of-bound group index', async () => {
      const { service } = await setup({
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

    it('gets the wallet and multichain account for a given account ID', async () => {
      const accounts = [account1, account2, account3];
      const { service } = await setup({ accounts, keyrings });

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

    it('syncs the appropriate wallet and update reverse mapping on AccountsController:accountAdded', async () => {
      const accounts = [account1, account3]; // No `account2` for now.
      const { service, rootMessenger, mocks } = await setup({
        accounts,
        keyrings,
      });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(1);

      // Now we're adding `account2`.
      mocks.EvmAccountProvider.accounts = [account1, account2];
      rootMessenger.publish(
        'AccountsController:accountAdded',
        mockAsInternalAccount(account2),
      );
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

    it('syncs the appropriate multichain account and update reverse mapping on AccountsController:accountAdded', async () => {
      const otherAccount1 = MockAccountBuilder.from(account2)
        .withGroupIndex(0)
        .get();

      const accounts = [account1]; // No `otherAccount1` for now.
      const { service, rootMessenger, mocks } = await setup({
        accounts,
        keyrings,
      });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(1);

      // Now we're adding `account2`.
      mocks.EvmAccountProvider.accounts = [account1, otherAccount1];
      rootMessenger.publish(
        'AccountsController:accountAdded',
        mockAsInternalAccount(otherAccount1),
      );
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

    it('emits multichainAccountGroupUpdated event when syncing existing group on account added', async () => {
      const otherAccount1 = MockAccountBuilder.from(account2)
        .withGroupIndex(0)
        .get();

      const accounts = [account1]; // No `otherAccount1` for now.
      const { rootMessenger, messenger, mocks } = await setup({
        accounts,
        keyrings,
      });
      const publishSpy = jest.spyOn(messenger, 'publish');

      // Now we're adding `otherAccount1` to an existing group.
      mocks.EvmAccountProvider.accounts = [account1, otherAccount1];
      rootMessenger.publish(
        'AccountsController:accountAdded',
        mockAsInternalAccount(otherAccount1),
      );

      // Should emit updated event for the existing group
      expect(publishSpy).toHaveBeenCalled();
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainAccountService:multichainAccountGroupUpdated',
        expect.objectContaining({
          groupIndex: 0,
        }),
      );

      const emittedGroup = publishSpy.mock.calls[0][1];
      expect(emittedGroup).toBeDefined();
      expect(emittedGroup).toHaveProperty('groupIndex', 0);
      expect(emittedGroup).toHaveProperty('getAccounts');
      expect(emittedGroup).toHaveProperty('select');
      expect(emittedGroup).toHaveProperty('get');
    });

    it('creates new detected wallets and update reverse mapping on AccountsController:accountAdded', async () => {
      const accounts = [account1, account2]; // No `account3` for now (associated with "Wallet 2").
      const { service, rootMessenger, mocks } = await setup({
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
      rootMessenger.publish(
        'AccountsController:accountAdded',
        mockAsInternalAccount(account3),
      );
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

    it('ignores non-BIP-44 accounts on AccountsController:accountAdded', async () => {
      const accounts = [account1];
      const { service, rootMessenger } = await setup({
        accounts,
        keyrings,
      });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      const oldMultichainAccounts = wallet1.getMultichainAccountGroups();
      expect(oldMultichainAccounts).toHaveLength(1);
      expect(oldMultichainAccounts[0].getAccounts()).toHaveLength(1);

      // Now we're publishing a new account that is not BIP-44 compatible.
      rootMessenger.publish(
        'AccountsController:accountAdded',
        mockAsInternalAccount(MOCK_SNAP_ACCOUNT_2),
      );

      const newMultichainAccounts = wallet1.getMultichainAccountGroups();
      expect(newMultichainAccounts).toHaveLength(1);
      expect(newMultichainAccounts[0].getAccounts()).toHaveLength(1);
    });

    it('syncs the appropriate wallet and update reverse mapping on AccountsController:accountRemoved', async () => {
      const accounts = [account1, account2];
      const { service, rootMessenger, mocks } = await setup({
        accounts,
        keyrings,
      });

      const wallet1 = service.getMultichainAccountWallet({
        entropySource: entropy1,
      });
      expect(wallet1.getMultichainAccountGroups()).toHaveLength(2);

      // Now we're removing `account2`.
      mocks.EvmAccountProvider.accounts = [account1];
      rootMessenger.publish('AccountsController:accountRemoved', account2.id);
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

      const { service } = await setup({ accounts: [mockEvmAccount] });

      const nextGroup = await service.createNextMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });
      expect(nextGroup.groupIndex).toBe(1);
      // NOTE: There won't be any account for this group, since we're not
      // mocking the providers.
    });

    it('emits multichainAccountGroupCreated event when creating next group', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { service, messenger } = await setup({
        accounts: [mockEvmAccount],
      });
      const publishSpy = jest.spyOn(messenger, 'publish');

      const nextGroup = await service.createNextMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });

      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainAccountService:multichainAccountGroupCreated',
        nextGroup,
      );
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

      const { service } = await setup({
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

      expect(firstGroup.groupIndex).toBe(0);
      expect(firstGroup.getAccounts()).toHaveLength(1);
      expect(firstGroup.getAccounts()[0]).toStrictEqual(mockEvmAccount);

      expect(secondGroup.groupIndex).toBe(1);
      expect(secondGroup.getAccounts()).toHaveLength(1);
      expect(secondGroup.getAccounts()[0]).toStrictEqual(mockSolAccount);
    });

    it('emits multichainAccountGroupCreated event when creating specific group', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { service, messenger } = await setup({
        accounts: [mockEvmAccount],
      });
      const publishSpy = jest.spyOn(messenger, 'publish');

      const group = await service.createMultichainAccountGroup({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      });

      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainAccountService:multichainAccountGroupCreated',
        group,
      );
    });
  });

  describe('alignWallets', () => {
    it('aligns all multichain account wallets', async () => {
      const mockEvmAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount1 = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_2.metadata.id)
        .withGroupIndex(0)
        .get();
      const { service, mocks } = await setup({
        accounts: [mockEvmAccount1, mockSolAccount1],
      });

      await service.alignWallets();

      expect(mocks.EvmAccountProvider.createAccounts).toHaveBeenCalledWith({
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        groupIndex: 0,
      });
      expect(mocks.SolAccountProvider.createAccounts).toHaveBeenCalledWith({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });
    });
  });

  describe('alignWallet', () => {
    it('aligns a specific multichain account wallet', async () => {
      const mockEvmAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount1 = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_2.metadata.id)
        .withGroupIndex(0)
        .get();
      const { service, mocks } = await setup({
        accounts: [mockEvmAccount1, mockSolAccount1],
      });

      await service.alignWallet(MOCK_HD_KEYRING_1.metadata.id);

      expect(mocks.SolAccountProvider.createAccounts).toHaveBeenCalledWith({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });
      expect(mocks.EvmAccountProvider.createAccounts).not.toHaveBeenCalled();
    });
  });

  describe('actions', () => {
    it('gets a multichain account with MultichainAccountService:getMultichainAccount', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = await setup({ accounts });

      const group = messenger.call(
        'MultichainAccountService:getMultichainAccountGroup',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id, groupIndex: 0 },
      );
      expect(group).toBeDefined();
    });

    it('gets multichain accounts with MultichainAccountService:getMultichainAccounts', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = await setup({ accounts });

      const groups = messenger.call(
        'MultichainAccountService:getMultichainAccountGroups',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      );
      expect(groups.length).toBeGreaterThan(0);
    });

    it('gets multichain account wallet with MultichainAccountService:getMultichainAccountWallet', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = await setup({ accounts });

      const wallet = messenger.call(
        'MultichainAccountService:getMultichainAccountWallet',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      );
      expect(wallet).toBeDefined();
    });

    it('gets multichain account wallet with MultichainAccountService:getMultichainAccountWallets', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = await setup({ accounts });

      const wallets = messenger.call(
        'MultichainAccountService:getMultichainAccountWallets',
      );
      expect(wallets.length).toBeGreaterThan(0);
    });

    it('create the next multichain account group with MultichainAccountService:createNextMultichainAccountGroup', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = await setup({ accounts });

      const nextGroup = await messenger.call(
        'MultichainAccountService:createNextMultichainAccountGroup',
        { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      );
      expect(nextGroup.groupIndex).toBe(1);
      // NOTE: There won't be any account for this group, since we're not
      // mocking the providers.
    });

    it('creates a multichain account group with MultichainAccountService:createMultichainAccountGroup', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { messenger } = await setup({ accounts });

      const firstGroup = await messenger.call(
        'MultichainAccountService:createMultichainAccountGroup',
        {
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex: 0,
        },
      );

      expect(firstGroup.groupIndex).toBe(0);
      expect(firstGroup.getAccounts()).toHaveLength(1);
      expect(firstGroup.getAccounts()[0]).toStrictEqual(MOCK_HD_ACCOUNT_1);
    });

    it('aligns a multichain account wallet with MultichainAccountService:alignWallet', async () => {
      const mockEvmAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount1 = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_2.metadata.id)
        .withGroupIndex(0)
        .get();
      const { messenger, mocks } = await setup({
        accounts: [mockEvmAccount1, mockSolAccount1],
      });

      await messenger.call(
        'MultichainAccountService:alignWallet',
        MOCK_HD_KEYRING_1.metadata.id,
      );

      expect(mocks.SolAccountProvider.createAccounts).toHaveBeenCalledWith({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });
      expect(mocks.EvmAccountProvider.createAccounts).not.toHaveBeenCalled();
    });

    it('aligns all multichain account wallets with MultichainAccountService:alignWallets', async () => {
      const mockEvmAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount1 = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_2.metadata.id)
        .withGroupIndex(0)
        .get();
      const { messenger, mocks } = await setup({
        accounts: [mockEvmAccount1, mockSolAccount1],
      });

      await messenger.call('MultichainAccountService:alignWallets');

      expect(mocks.EvmAccountProvider.createAccounts).toHaveBeenCalledWith({
        entropySource: MOCK_HD_KEYRING_2.metadata.id,
        groupIndex: 0,
      });
      expect(mocks.SolAccountProvider.createAccounts).toHaveBeenCalledWith({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      });
    });

    it('sets basic functionality with MultichainAccountService:setBasicFunctionality', async () => {
      const { messenger } = await setup({
        accounts: [MOCK_HD_ACCOUNT_1],
      });

      // This tests the action handler registration
      expect(
        await messenger.call(
          'MultichainAccountService:setBasicFunctionality',
          true,
        ),
      ).toBeUndefined();
      expect(
        await messenger.call(
          'MultichainAccountService:setBasicFunctionality',
          false,
        ),
      ).toBeUndefined();
    });

    it('creates a multichain account wallet with MultichainAccountService:createMultichainAccountWallet', async () => {
      const { messenger, mocks } = await setup({ accounts: [], keyrings: [] });

      mocks.KeyringController.getKeyringsByType.mockImplementationOnce(
        () => [],
      );

      mocks.KeyringController.addNewKeyring.mockImplementationOnce(() => ({
        id: 'abc',
        name: '',
      }));

      const wallet = await messenger.call(
        'MultichainAccountService:createMultichainAccountWallet',
        { mnemonic: MOCK_MNEMONIC },
      );

      expect(wallet).toBeDefined();
      expect(wallet.entropySource).toBe('abc');
    });

    it('resync accounts with MultichainAccountService:resyncAccounts', async () => {
      const { messenger, service } = await setup({
        accounts: [MOCK_HD_ACCOUNT_1],
      });

      const resyncAccountsSpy = jest.spyOn(service, 'resyncAccounts');
      await messenger.call('MultichainAccountService:resyncAccounts');
      expect(resyncAccountsSpy).toHaveBeenCalled();
    });
  });

  describe('resyncAccounts', () => {
    it('calls resyncAccounts on each providers', async () => {
      const { service, mocks } = await setup({ accounts: [MOCK_HD_ACCOUNT_1] });

      await service.resyncAccounts();

      expect(mocks.EvmAccountProvider.resyncAccounts).toHaveBeenCalled();
      expect(mocks.SolAccountProvider.resyncAccounts).toHaveBeenCalled();
    });

    it('filters BIP-44 accounts before calling providers', async () => {
      const accounts = [
        MOCK_HD_ACCOUNT_1,
        MOCK_SNAP_ACCOUNT_1, // Not a BIP-44 accounts.
        MOCK_HD_ACCOUNT_2,
      ];

      const { service, mocks } = await setup({
        accounts,
      });

      await service.resyncAccounts();

      const bip44Accounts = accounts.filter(isBip44Account);

      expect(mocks.EvmAccountProvider.resyncAccounts).toHaveBeenCalledWith(
        bip44Accounts,
      );
      expect(mocks.SolAccountProvider.resyncAccounts).toHaveBeenCalledWith(
        bip44Accounts,
      );
    });

    it('does not throw if any providers is throwing', async () => {
      const rootMessenger = getRootMessenger();
      const { service, mocks } = await setup({
        rootMessenger,
        accounts: [MOCK_HD_ACCOUNT_1],
      });

      const providerError = new Error('Unable to resync accounts');
      mocks.SolAccountProvider.resyncAccounts.mockRejectedValue(providerError);

      const mockCaptureException = jest.fn();
      rootMessenger.registerActionHandler(
        'ErrorReportingService:captureException',
        mockCaptureException,
      );

      await service.resyncAccounts(); // Should not throw.

      expect(mocks.EvmAccountProvider.resyncAccounts).toHaveBeenCalled();
      expect(mocks.SolAccountProvider.resyncAccounts).toHaveBeenCalled();

      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockCaptureException.mock.lastCall[0]).toHaveProperty(
        'cause',
        providerError,
      );
    });
  });

  describe('setBasicFunctionality', () => {
    it('can be called with boolean true', async () => {
      const { service } = await setup({ accounts: [MOCK_HD_ACCOUNT_1] });

      // This tests the simplified parameter signature
      expect(await service.setBasicFunctionality(true)).toBeUndefined();
    });

    it('can be called with boolean false', async () => {
      const { service } = await setup({ accounts: [MOCK_HD_ACCOUNT_1] });

      // This tests the simplified parameter signature
      expect(await service.setBasicFunctionality(false)).toBeUndefined();
    });
  });

  describe('AccountProviderWrapper disabled behavior', () => {
    let wrapper: AccountProviderWrapper;
    let solProvider: SolAccountProvider;

    beforeEach(async () => {
      const { rootMessenger } = await setup({
        accounts: [MOCK_HD_ACCOUNT_1],
      });

      // Create actual SolAccountProvider instance for wrapping
      solProvider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(rootMessenger),
      );

      // Spy on the provider methods
      jest.spyOn(solProvider, 'resyncAccounts');
      jest.spyOn(solProvider, 'getAccounts');
      jest.spyOn(solProvider, 'getAccount');
      jest.spyOn(solProvider, 'createAccounts');
      jest.spyOn(solProvider, 'discoverAccounts');
      jest.spyOn(solProvider, 'isAccountCompatible');

      wrapper = new AccountProviderWrapper(
        getMultichainAccountServiceMessenger(rootMessenger),
        solProvider,
      );
    });

    it('forwards resyncAccounts() if provider is enabled', async () => {
      const spy = jest.spyOn(solProvider, 'resyncAccounts');

      // Enable first - should work normally
      spy.mockResolvedValue(undefined);
      await wrapper.resyncAccounts([]);
      expect(spy).toHaveBeenCalledTimes(1);

      // Disable - should return empty array
      wrapper.setEnabled(false);
      await wrapper.resyncAccounts([]);
      expect(spy).toHaveBeenCalledTimes(1); // No new call, still 1 call
    });

    it('returns empty array when getAccounts() is disabled', () => {
      // Enable first - should work normally
      (solProvider.getAccounts as jest.Mock).mockReturnValue([
        MOCK_HD_ACCOUNT_1,
      ]);
      expect(wrapper.getAccounts()).toStrictEqual([MOCK_HD_ACCOUNT_1]);

      // Disable - should return empty array
      wrapper.setEnabled(false);
      expect(wrapper.getAccounts()).toStrictEqual([]);
    });

    it('throws error when getAccount() is disabled', () => {
      // Enable first - should work normally
      (solProvider.getAccount as jest.Mock).mockReturnValue(MOCK_HD_ACCOUNT_1);
      expect(wrapper.getAccount('test-id')).toStrictEqual(MOCK_HD_ACCOUNT_1);

      // Disable - should throw error
      wrapper.setEnabled(false);
      expect(() => wrapper.getAccount('test-id')).toThrow(
        'Provider is disabled',
      );
    });

    it('returns empty array when createAccounts() is disabled', async () => {
      const options = {
        entropySource: MOCK_HD_ACCOUNT_1.options.entropy.id,
        groupIndex: 0,
      };

      // Enable first - should work normally
      (solProvider.createAccounts as jest.Mock).mockResolvedValue([
        MOCK_HD_ACCOUNT_1,
      ]);
      expect(await wrapper.createAccounts(options)).toStrictEqual([
        MOCK_HD_ACCOUNT_1,
      ]);

      // Disable - should return empty array and not call underlying provider
      wrapper.setEnabled(false);

      const result = await wrapper.createAccounts(options);
      expect(result).toStrictEqual([]);
    });

    it('returns empty array when discoverAccounts() is disabled', async () => {
      const options = {
        entropySource: MOCK_HD_ACCOUNT_1.options.entropy.id,
        groupIndex: 0,
      };

      // Enable first - should work normally
      (solProvider.discoverAccounts as jest.Mock).mockResolvedValue([
        MOCK_HD_ACCOUNT_1,
      ]);
      expect(await wrapper.discoverAccounts(options)).toStrictEqual([
        MOCK_HD_ACCOUNT_1,
      ]);

      // Disable - should return empty array
      wrapper.setEnabled(false);

      const result = await wrapper.discoverAccounts(options);
      expect(result).toStrictEqual([]);
    });

    it('delegates isAccountCompatible() to wrapped provider', () => {
      // Mock the provider's compatibility check
      (solProvider.isAccountCompatible as jest.Mock).mockReturnValue(true);
      expect(wrapper.isAccountCompatible(MOCK_HD_ACCOUNT_1)).toBe(true);
      expect(solProvider.isAccountCompatible).toHaveBeenCalledWith(
        MOCK_HD_ACCOUNT_1,
      );

      // Test with false return
      (solProvider.isAccountCompatible as jest.Mock).mockReturnValue(false);
      expect(wrapper.isAccountCompatible(MOCK_HD_ACCOUNT_1)).toBe(false);
    });
  });

  describe('createMultichainAccountWallet', () => {
    it('creates a new multichain account wallet with the given mnemonic', async () => {
      const { mocks, service } = await setup({
        accounts: [],
        keyrings: [],
      });

      mocks.KeyringController.getKeyringsByType.mockImplementationOnce(() => [
        {},
      ]);

      mocks.KeyringController.addNewKeyring.mockImplementationOnce(() => ({
        id: 'abc',
        name: '',
      }));

      const wallet = await service.createMultichainAccountWallet({
        mnemonic: MOCK_MNEMONIC,
      });

      expect(wallet).toBeDefined();
      expect(wallet.entropySource).toBe('abc');
    });

    it("throws an error if there's already an existing keyring from the same mnemonic", async () => {
      const { service, mocks } = await setup({ accounts: [], keyrings: [] });

      const mnemonic = mnemonicPhraseToBytes(MOCK_MNEMONIC);

      mocks.KeyringController.getKeyringsByType.mockImplementationOnce(() => [
        {
          mnemonic,
        },
      ]);

      await expect(
        service.createMultichainAccountWallet({ mnemonic: MOCK_MNEMONIC }),
      ).rejects.toThrow(
        'This Secret Recovery Phrase has already been imported.',
      );

      // Ensure we did not attempt to create a new keyring when duplicate is detected
      expect(mocks.KeyringController.addNewKeyring).not.toHaveBeenCalled();
    });
  });
});
