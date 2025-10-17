/* eslint-disable jsdoc/require-jsdoc */

import type { Messenger } from '@metamask/base-controller';
import { mnemonicPhraseToBytes } from '@metamask/key-tree';
import type { KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType, SolAccountType } from '@metamask/keyring-api';
import { KeyringTypes, type KeyringObject } from '@metamask/keyring-controller';
import type { EthKeyring } from '@metamask/keyring-internal-api';

import type { MultichainAccountServiceOptions } from './MultichainAccountService';
import { MultichainAccountService } from './MultichainAccountService';
import type { NamedAccountProvider } from './providers';
import { AccountProviderWrapper } from './providers/AccountProviderWrapper';
import {
  EVM_ACCOUNT_PROVIDER_NAME,
  EvmAccountProvider,
} from './providers/EvmAccountProvider';
import {
  SOL_ACCOUNT_PROVIDER_NAME,
  SolAccountProvider,
} from './providers/SolAccountProvider';
import type { MockAccountProvider } from './tests';
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
  setupNamedAccountProvider,
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
    getKeyringsByType: jest.Mock;
    addNewKeyring: jest.Mock;
    createNewVaultAndKeychain: jest.Mock;
    createNewVaultAndRestore: jest.Mock;
    withKeyring: jest.Mock;
  };
  AccountsController: {
    listMultichainAccounts: jest.Mock;
  };
  EvmAccountProvider: MockAccountProvider;
  SolAccountProvider: MockAccountProvider;
};

function mockAccountProvider<Provider extends NamedAccountProvider>(
  providerClass: new (messenger: MultichainAccountServiceMessenger) => Provider,
  mocks: MockAccountProvider,
  accounts: KeyringAccount[],
  idx: number,
) {
  jest.mocked(providerClass).mockImplementation((...args) => {
    mocks.constructor(...args);
    return mocks as unknown as Provider;
  });

  setupNamedAccountProvider({
    mocks,
    accounts,
    index: idx,
  });

  // Provide stable provider name and compatibility logic for grouping
  if (providerClass === (EvmAccountProvider as unknown)) {
    mocks.getName.mockReturnValue(EVM_ACCOUNT_PROVIDER_NAME);
    mocks.isAccountCompatible?.mockImplementation(
      (account: KeyringAccount) => account.type === EthAccountType.Eoa,
    );
  } else if (providerClass === (SolAccountProvider as unknown)) {
    mocks.getName.mockReturnValue(SOL_ACCOUNT_PROVIDER_NAME);
    mocks.isAccountCompatible?.mockImplementation(
      (account: KeyringAccount) => account.type === SolAccountType.DataAccount,
    );
  }
}

function setup({
  messenger = getRootMessenger(),
  keyrings = [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
  accounts,
  providerConfigs,
}: {
  messenger?: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  keyrings?: KeyringObject[];
  accounts?: KeyringAccount[];
  providerConfigs?: MultichainAccountServiceOptions['providerConfigs'];
} = {}): {
  service: MultichainAccountService;
  serviceMessenger: MultichainAccountServiceMessenger;
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
      getKeyringsByType: jest.fn(),
      addNewKeyring: jest.fn(),
      createNewVaultAndKeychain: jest.fn(),
      createNewVaultAndRestore: jest.fn(),
      withKeyring: jest.fn(),
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

  messenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );

  messenger.registerActionHandler(
    'KeyringController:getKeyringsByType',
    mocks.KeyringController.getKeyringsByType,
  );

  messenger.registerActionHandler(
    'KeyringController:addNewKeyring',
    mocks.KeyringController.addNewKeyring,
  );

  messenger.registerActionHandler(
    'KeyringController:createNewVaultAndKeychain',
    mocks.KeyringController.createNewVaultAndKeychain,
  );

  messenger.registerActionHandler(
    'KeyringController:createNewVaultAndRestore',
    mocks.KeyringController.createNewVaultAndRestore,
  );

  if (accounts) {
    mocks.AccountsController.listMultichainAccounts.mockImplementation(
      () => accounts,
    );

    messenger.registerActionHandler(
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
      0,
    );
    mockAccountProvider<SolAccountProvider>(
      SolAccountProvider,
      mocks.SolAccountProvider,
      accounts,
      1,
    );
  }

  const serviceMessenger = getMultichainAccountServiceMessenger(messenger);
  const service = new MultichainAccountService({
    messenger: serviceMessenger,
    providerConfigs,
  });
  service.init();

  return { service, serviceMessenger, messenger, mocks };
}

describe('MultichainAccountService', () => {
  describe('constructor', () => {
    it('forwards configs to each provider', () => {
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

      const { mocks, serviceMessenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_SOL_ACCOUNT_1],
        providerConfigs,
      });

      expect(mocks.EvmAccountProvider.constructor).toHaveBeenCalledWith(
        serviceMessenger,
        providerConfigs[EvmAccountProvider.NAME],
      );
      expect(mocks.SolAccountProvider.constructor).toHaveBeenCalledWith(
        serviceMessenger,
        providerConfigs[SolAccountProvider.NAME],
      );
    });

    it('allows optional configs for some providers', () => {
      const providerConfigs: MultichainAccountServiceOptions['providerConfigs'] =
        {
          // NOTE: We use constants here, since `*AccountProvider` are mocked, thus, their `.NAME` will
          // be `undefined`.
          [SOL_ACCOUNT_PROVIDER_NAME]: {
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

      const { mocks, serviceMessenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_SOL_ACCOUNT_1],
        providerConfigs,
      });

      expect(mocks.EvmAccountProvider.constructor).toHaveBeenCalledWith(
        serviceMessenger,
        undefined,
      );
      expect(mocks.SolAccountProvider.constructor).toHaveBeenCalledWith(
        serviceMessenger,
        providerConfigs[SolAccountProvider.NAME],
      );
    });
  });

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
      expect(group.groupIndex).toBe(groupIndex);

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

  describe('createNextMultichainAccountGroup', () => {
    it('creates the next multichain account group', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { service } = setup({ accounts: [mockEvmAccount] });

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

      const { service, messenger } = setup({ accounts: [mockEvmAccount] });
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

      const { service, messenger } = setup({ accounts: [mockEvmAccount] });
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
      const { service, mocks } = setup({
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
      const { service, mocks } = setup({
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
      expect(nextGroup.groupIndex).toBe(1);
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
      const { messenger, mocks } = setup({
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
      const { messenger, mocks } = setup({
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
      const { messenger } = setup({ accounts: [MOCK_HD_ACCOUNT_1] });

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
      const { messenger, mocks } = setup({ accounts: [], keyrings: [] });

      const mnemonic = mnemonicPhraseToBytes(MOCK_MNEMONIC);

      mocks.KeyringController.getKeyringsByType.mockImplementationOnce(
        () => [],
      );

      mocks.KeyringController.addNewKeyring.mockImplementationOnce(() => ({
        id: 'abc',
        name: '',
      }));

      const wallet = await messenger.call(
        'MultichainAccountService:createMultichainAccountWallet',
        { mnemonic, type: 'import' },
      );

      expect(wallet).toBeDefined();
      expect(wallet.entropySource).toBe('abc');
    });
  });

  describe('setBasicFunctionality', () => {
    it('can be called with boolean true', async () => {
      const { service } = setup({ accounts: [MOCK_HD_ACCOUNT_1] });

      // This tests the simplified parameter signature
      expect(await service.setBasicFunctionality(true)).toBeUndefined();
    });

    it('can be called with boolean false', async () => {
      const { service } = setup({ accounts: [MOCK_HD_ACCOUNT_1] });

      // This tests the simplified parameter signature
      expect(await service.setBasicFunctionality(false)).toBeUndefined();
    });
  });

  describe('AccountProviderWrapper disabled behavior', () => {
    let wrapper: AccountProviderWrapper;
    let solProvider: SolAccountProvider;

    beforeEach(() => {
      const { messenger } = setup({ accounts: [MOCK_HD_ACCOUNT_1] });

      // Create actual SolAccountProvider instance for wrapping
      solProvider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
      );

      // Spy on the provider methods
      jest.spyOn(solProvider, 'getAccounts');
      jest.spyOn(solProvider, 'getAccount');
      jest.spyOn(solProvider, 'createAccounts');
      jest.spyOn(solProvider, 'discoverAccounts');
      jest.spyOn(solProvider, 'isAccountCompatible');

      wrapper = new AccountProviderWrapper(
        getMultichainAccountServiceMessenger(messenger),
        solProvider,
      );
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
    it('throws an error if the create wallet parameters are invalid', async () => {
      const { service } = setup({ accounts: [], keyrings: [] });
      await expect(() =>
        service.createMultichainAccountWallet({
          type: 'create',
        }),
      ).rejects.toThrow('Invalid create wallet parameters.');
    });

    describe('createWalletByImport', () => {
      it('creates a new multichain account wallet by the import flow', async () => {
        const { mocks, service } = setup({
          accounts: [],
          keyrings: [],
        });

        const mnemonic = mnemonicPhraseToBytes(MOCK_MNEMONIC);

        mocks.KeyringController.getKeyringsByType.mockImplementationOnce(() => [
          {},
        ]);

        mocks.KeyringController.addNewKeyring.mockImplementationOnce(() => ({
          id: 'abc',
          name: '',
        }));

        const wallet = await service.createMultichainAccountWallet({
          mnemonic,
          type: 'import',
        });

        expect(wallet).toBeDefined();
        expect(wallet.entropySource).toBe('abc');
      });

      it("throws an error if there's already an existing keyring from the same mnemonic", async () => {
        const { service, mocks } = setup({ accounts: [], keyrings: [] });

        const mnemonic = mnemonicPhraseToBytes(MOCK_MNEMONIC);

        mocks.KeyringController.getKeyringsByType.mockImplementationOnce(() => [
          {
            mnemonic,
          },
        ]);

        await expect(
          service.createMultichainAccountWallet({
            mnemonic,
            type: 'import',
          }),
        ).rejects.toThrow(
          'This Secret Recovery Phrase has already been imported.',
        );

        // Ensure we did not attempt to create a new keyring when duplicate is detected
        expect(mocks.KeyringController.addNewKeyring).not.toHaveBeenCalled();
      });
    });

    describe('createWalletByNewVault', () => {
      it('creates a new multichain account wallet by the new vault flow', async () => {
        const { service, mocks, messenger } = setup({
          accounts: [],
          keyrings: [],
        });

        const password = 'password';

        mocks.KeyringController.createNewVaultAndKeychain.mockImplementationOnce(
          () => {
            mocks.KeyringController.keyrings.push(MOCK_HD_KEYRING_1);
          },
        );

        messenger.registerActionHandler(
          'KeyringController:withKeyring',
          async (_, operation) => {
            const newKeyring = mocks.KeyringController.keyrings.find(
              (keyring) => keyring.type === KeyringTypes.hd,
            ) as KeyringObject;
            return operation({
              keyring: {} as unknown as EthKeyring,
              metadata: newKeyring.metadata,
            });
          },
        );

        const newWallet = await service.createMultichainAccountWallet({
          password,
          type: 'create',
        });

        expect(newWallet).toBeDefined();
        expect(newWallet.entropySource).toBe(MOCK_HD_KEYRING_1.metadata.id);
      });
    });

    describe('createWalletByRestore', () => {
      it('creates a new multichain account wallet by the restore flow', async () => {
        const { service, mocks, messenger } = setup({
          accounts: [],
          keyrings: [],
        });

        const mnemonic = mnemonicPhraseToBytes(MOCK_MNEMONIC);
        const password = 'password';

        mocks.KeyringController.createNewVaultAndRestore.mockImplementationOnce(
          () => {
            mocks.KeyringController.keyrings.push(MOCK_HD_KEYRING_1);
          },
        );

        messenger.registerActionHandler(
          'KeyringController:withKeyring',
          async (_, operation) => {
            const newKeyring = mocks.KeyringController.keyrings.find(
              (keyring) => keyring.type === KeyringTypes.hd,
            ) as KeyringObject;
            return operation({
              keyring: {} as unknown as EthKeyring,
              metadata: newKeyring.metadata,
            });
          },
        );

        const newWallet = await service.createMultichainAccountWallet({
          password,
          mnemonic,
          type: 'restore',
        });

        expect(newWallet).toBeDefined();
        expect(newWallet.entropySource).toBe(MOCK_HD_KEYRING_1.metadata.id);
      });
    });
  });
});
