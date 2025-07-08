import type { Messenger } from '@metamask/base-controller';
import { EthAccountType, SolAccountType } from '@metamask/keyring-api';
import type { KeyringObject } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { MultichainAccountController } from './MultichainAccountController';
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
} from './types';

/**
 * Sets up the MultichainAccountController for testing.
 *
 * @param options - Configuration options for setup.
 * @param options.messenger - An optional messenger instance to use. Defaults to a new Messenger.
 * @param options.keyrings - List of keyrings to use.
 * @param options.accounts - List of accounts to use.
 * @returns An object containing the controller instance and the messenger.
 */
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
} {
  messenger.registerActionHandler('KeyringController:getState', () => ({
    isUnlocked: true,
    keyrings,
  }));

  if (accounts) {
    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      () => accounts,
    );
  }

  const controller = new MultichainAccountController({
    messenger: getMultichainAccountControllerMessenger(messenger),
  });
  controller.init();

  return { controller, messenger };
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
      const messenger = getRootMessenger();

      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      // This list will be used to build the initial wallet with 1 multichain account (for
      // group index 0)!
      const mockListMultichainAccounts = jest
        .fn()
        .mockReturnValue([mockEvmAccount]);
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        mockListMultichainAccounts,
      );

      const { controller } = setup({ messenger });

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

      // Required by the EvmAccountProvider + SolAccountProvider:
      const mockWithKeyring = jest.fn();
      messenger.registerActionHandler(
        'KeyringController:withKeyring',
        mockWithKeyring,
      );

      // Required by the EvmAccountProvider:
      mockWithKeyring.mockResolvedValueOnce([mockNextEvmAccount.address]);

      // Required by the SolAccountProvider:
      mockWithKeyring.mockResolvedValueOnce(
        jest.fn().mockResolvedValue(mockNextSolAccount),
      );
      const mockHandleRequest = jest.fn().mockResolvedValue(
        MockAccountBuilder.toKeyringAccount(mockNextSolAccount), // Required by KeyringClient.
      );
      messenger.registerActionHandler(
        'SnapController:handleRequest',
        mockHandleRequest,
      );

      // Both providers rely on the accounts controller:
      const mockGetAccountByAddress = jest
        .fn()
        .mockResolvedValue(mockNextEvmAccount);
      messenger.registerActionHandler(
        'AccountsController:getAccountByAddress',
        mockGetAccountByAddress,
      );
      const mockGetAccount = jest.fn().mockResolvedValue(mockNextSolAccount);
      messenger.registerActionHandler(
        'AccountsController:getAccount',
        mockGetAccount,
      );

      // Finally, the multichain account will re-use the list of internal account
      // to groups accounts for the new index, so we have to add them to the list
      // of internal accounts, as if they were really created.
      mockListMultichainAccounts.mockReturnValue([
        // Group index 0:
        mockEvmAccount,
        // Group index 1:
        mockNextEvmAccount,
        mockNextSolAccount,
      ]);

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
    it.todo('discovers and creates multichain accounts');
  });
});
