/* eslint-disable jsdoc/require-jsdoc */
import type { Messenger } from '@metamask/base-controller';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType, SolAccountType } from '@metamask/keyring-api';
import type { KeyringObject } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { MultichainAccountController } from './MultichainAccountController';
import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import {
  getMultichainAccountControllerMessenger,
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
  MultichainAccountControllerActions,
  MultichainAccountControllerEvents,
  MultichainAccountControllerMessenger,
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
  providerClass: new (
    messenger: MultichainAccountControllerMessenger,
  ) => Provider,
  mocks: MockAccountProvider,
  accounts: InternalAccount[],
  type: KeyringAccount['type'],
) {
  jest
    .mocked(providerClass)
    .mockImplementation(() => mocks as unknown as Provider);

  mocks.getAccounts.mockImplementation(
    ({
      entropySource,
      groupIndex,
    }: {
      entropySource: EntropySourceId;
      groupIndex: number;
    }) =>
      accounts
        .filter(
          (account) =>
            account.type === type &&
            account.options.entropySource === entropySource &&
            account.options.index === groupIndex,
        )
        .map((account) => account.id),
  );

  mocks.getAccount.mockImplementation((id: InternalAccount['id']) => {
    return accounts.find((account) => account.id === id);
  });
}

function setup({
  messenger = getRootMessenger(),
  keyrings = [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
  accounts,
}: {
  messenger?: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
  keyrings?: KeyringObject[];
  accounts?: InternalAccount[];
} = {}): {
  controller: MultichainAccountController;
  messenger: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    listMultichainAccounts: jest.fn(),
    EvmAccountProvider: {
      getAccount: jest.fn(),
      getAccounts: jest.fn(),
      createAccounts: jest.fn(),
      discoverAndCreateAccounts: jest.fn(),
    },
    SolAccountProvider: {
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

  const controller = new MultichainAccountController({
    messenger: getMultichainAccountControllerMessenger(messenger),
  });
  controller.init();

  return { controller, messenger, mocks };
}

describe('MultichainAccountController', () => {
  describe('getMultichainAccounts', () => {
    it('gets multichain accounts', () => {
      const { controller } = setup({
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
        controller.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        }),
      ).toHaveLength(1);
      expect(
        controller.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toHaveLength(1);
    });

    it('gets multichain accounts with multiple wallets', () => {
      const { controller } = setup({
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

      const multichainAccounts = controller.getMultichainAccounts({
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
      const { controller } = setup({
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
        controller.getMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_2.metadata.id,
        }),
      ).toThrow('Unknown wallet, not wallet matching this entropy source');
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
      const { controller } = setup({
        accounts,
      });

      const groupIndex = 1;
      const multichainAccount = controller.getMultichainAccount({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex,
      });
      expect(multichainAccount.index).toBe(groupIndex);

      const internalAccounts = multichainAccount.getAccounts();
      expect(internalAccounts).toHaveLength(1);
      expect(internalAccounts[0]).toStrictEqual(accounts[1]);
    });

    it('throws if trying to access an out-of-bound group index', () => {
      const { controller } = setup({
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
        controller.getMultichainAccount({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          groupIndex,
        }),
      ).toThrow(`No multichain account for index: ${groupIndex}`);
    });
  });

  describe('createNextMultichainAccount', () => {
    it('creates the next multichain account', async () => {
      // Used to build the initial wallet with 1 multichain account (for
      // group index 0)!
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { controller, mocks } = setup({ accounts: [mockEvmAccount] });

      // Before creating the next multichain account, we need to mock some actions:
      const mockNextEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const mockNextSolAccount = MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .withUuuid() // Required by KeyringClient.
        .get();

      // We need to mock every call made to the providers when creating an accounts:
      for (const [mocksAccountProvider, mockNextAccount] of [
        [mocks.EvmAccountProvider, mockNextEvmAccount],
        [mocks.SolAccountProvider, mockNextSolAccount],
      ] as const) {
        // 1. Create the accounts for the new index and returns their IDs.
        mocksAccountProvider.createAccounts.mockResolvedValueOnce([
          mockNextAccount.id,
        ]);
        // 2. When the adapter creates a new multichain account, it will query all
        // accounts for this given index (so similar to the one we just created).
        mocksAccountProvider.getAccounts.mockReturnValueOnce([mockNextAccount]);
        // 3. Required when we call `getAccounts` (below) on the multichain account.
        mocksAccountProvider.getAccount.mockReturnValueOnce(mockNextAccount);
      }

      const multichainAccount = await controller.createNextMultichainAccount({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
      });
      expect(multichainAccount.index).toBe(1);

      const internalAccounts = multichainAccount.getAccounts();
      expect(internalAccounts).toHaveLength(2); // EVM + SOL.
      expect(internalAccounts[0].type).toBe(EthAccountType.Eoa);
      expect(internalAccounts[1].type).toBe(SolAccountType.DataAccount);
    });
  });

  describe('discoverAndCreateMultichainAccounts', () => {
    it('discovers and creates multichain accounts', async () => {
      // Starts with no accounts, to simulate the discovery.
      const { controller, mocks } = setup({ accounts: [] });

      // We need to mock every call made to the providers when discovery an accounts:
      for (const [mocksAccountProvider, mockDiscoveredAccount] of [
        [mocks.EvmAccountProvider, MOCK_HD_ACCOUNT_1],
        [mocks.SolAccountProvider, MOCK_SNAP_ACCOUNT_1],
      ] as const) {
        mocksAccountProvider.discoverAndCreateAccounts.mockResolvedValueOnce([
          mockDiscoveredAccount.id, // Account that got discovered and created.
        ]);
        mocksAccountProvider.discoverAndCreateAccounts.mockResolvedValueOnce(
          [], // Stop the discovery.
        );
        mocksAccountProvider.getAccounts.mockReturnValue([
          mockDiscoveredAccount.id, // Account that got created during discovery.
        ]);
        mocksAccountProvider.getAccount.mockReturnValue(mockDiscoveredAccount);
      }

      const multichainAccounts =
        await controller.discoverAndCreateMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        });
      // We only discover 1 account on each providers, which should only have 1 multichain
      // account.
      expect(multichainAccounts).toHaveLength(1);
      expect(multichainAccounts[0].index).toBe(0);

      const internalAccounts = multichainAccounts[0].getAccounts();
      expect(internalAccounts).toHaveLength(2); // EVM + SOL.
      expect(internalAccounts[0].type).toBe(EthAccountType.Eoa);
      expect(internalAccounts[1].type).toBe(SolAccountType.DataAccount);
    });

    it('discovers and creates multichain accounts for multiple index', async () => {
      // Starts with no accounts, to simulate the discovery.
      const { controller, mocks } = setup({ accounts: [] });

      const maxGroupIndex = 10;
      for (let i = 0; i < maxGroupIndex; i++) {
        // We need to mock every call made to the providers when discovery an accounts:
        for (const [mocksAccountProvider, mockDiscoveredAccount] of [
          [mocks.EvmAccountProvider, MOCK_HD_ACCOUNT_1],
          [mocks.SolAccountProvider, MOCK_SNAP_ACCOUNT_1],
        ] as const) {
          const mockDiscoveredAccountForIndex = MockAccountBuilder.from(
            mockDiscoveredAccount,
          )
            .withGroupIndex(i)
            .withUuuid()
            .get();

          mocksAccountProvider.discoverAndCreateAccounts.mockResolvedValueOnce([
            mockDiscoveredAccountForIndex.id, // Account that got discovered and created.
          ]);
        }
      }

      // Stop the discoveries.
      mocks.EvmAccountProvider.discoverAndCreateAccounts.mockResolvedValueOnce(
        [],
      );
      mocks.SolAccountProvider.discoverAndCreateAccounts.mockResolvedValueOnce(
        [],
      );

      const multichainAccounts =
        await controller.discoverAndCreateMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        });
      expect(multichainAccounts).toHaveLength(maxGroupIndex);
    });

    it('discovers and creates multichain accounts and fill gaps (alignmnent mechanism)', async () => {
      // Starts with no accounts, to simulate the discovery.
      const { controller, mocks } = setup({ accounts: [] });

      // We only mock calls for the EVM providers, the Solana provider won't discovery anything.
      const mocksAccountProvider = mocks.EvmAccountProvider;
      const mockDiscoveredAccount = MOCK_HD_ACCOUNT_1;
      mocksAccountProvider.discoverAndCreateAccounts.mockResolvedValueOnce([
        mockDiscoveredAccount.id, // Account that got discovered and created.
      ]);
      mocksAccountProvider.discoverAndCreateAccounts.mockResolvedValueOnce(
        [], // Stop the discovery.
      );
      mocksAccountProvider.getAccounts.mockReturnValue([
        mockDiscoveredAccount.id, // Account that got created during discovery.
      ]);
      mocksAccountProvider.getAccount.mockReturnValue(mockDiscoveredAccount);

      // No discovery for Solana.
      mocks.SolAccountProvider.discoverAndCreateAccounts.mockResolvedValue([]);
      mocks.SolAccountProvider.createAccounts.mockResolvedValue(
        MOCK_SNAP_ACCOUNT_1.id,
      );
      mocks.SolAccountProvider.getAccounts.mockReturnValue([
        MOCK_SNAP_ACCOUNT_1.id,
      ]);
      mocks.SolAccountProvider.getAccount.mockReturnValue(MOCK_SNAP_ACCOUNT_1);

      const multichainAccounts =
        await controller.discoverAndCreateMultichainAccounts({
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        });
      // We only discover 1 account on the EVM providers, which is still produce 1 multichain
      // account.
      expect(multichainAccounts).toHaveLength(1);
      expect(multichainAccounts[0].index).toBe(0);

      // And Solana account must have been created too (we "aligned" all accounts).
      expect(mocks.SolAccountProvider.createAccounts).toHaveBeenCalled();
      const internalAccounts = multichainAccounts[0].getAccounts();
      expect(internalAccounts).toHaveLength(2); // EVM + SOL.
      expect(internalAccounts[0].type).toBe(EthAccountType.Eoa);
      expect(internalAccounts[1].type).toBe(SolAccountType.DataAccount);
    });
  });
});
