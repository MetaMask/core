/* eslint-disable jsdoc/require-jsdoc */
import type { Messenger } from '@metamask/base-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
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

  mocks.getAccounts.mockImplementation(() =>
    accounts.filter((account) => account.type === type),
  );
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
});
